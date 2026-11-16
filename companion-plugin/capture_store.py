"""Session-fenced, repeatable-read capture storage for page chunk-pull.

When a page does not fit the turn envelope, the extension uploads the full
processed page text to the plugin's capture route and the envelope names the
plugin-issued capture id.  Unlike context records (one-shot, fenced by the
full owner tuple), a capture is fenced by ``(principal_id, session_id)`` and
stays readable across turns so the agent can page through it with
``browser_get_capture_chunk``; every turn whose envelope names the id
refreshes the binding.  Page text is untrusted data: this store never
interprets or redacts it (redaction happens in the extension before upload),
and it is reachable only through the trusted hook lease, like every other
companion capability.
"""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass, replace
import secrets
import threading
from time import time
from typing import Any, Callable, Optional

DEFAULT_CAPTURE_TTL_SECONDS = 1800.0
DEFAULT_UPLOAD_CAPTURE_TTL_SECONDS = 300.0
DEFAULT_MAX_CAPTURES = 32
DEFAULT_MAX_CAPTURES_PER_SESSION = 2
DEFAULT_MAX_CAPTURE_CHARS = 512_000
DEFAULT_MAX_CAPTURE_BYTES = 3_000_000
DEFAULT_CHUNK_CHARS = 24_000
MIN_CHUNK_CHARS = 4_000
MAX_CHUNK_CHARS = 64_000

_CAPTURE_ID_CHARS = 32  # secrets.token_hex(16), matching context ids
_MAX_OFFSET = 100_000_000


@dataclass(frozen=True)
class _Capture:
    capture_id: str
    fence: tuple[str, str]
    text: str
    total_chars: int
    clipped: bool
    created_at: float
    expires_at: float


@dataclass
class _PendingCapture:
    capture_id: str
    session_id: str
    text: str
    total_chars: int
    clipped: bool
    created_at: float
    expires_at: float


def _trusted(value: Any, limit: int = 256) -> str:
    """Normalize one trusted identifier (same posture as context_store)."""
    value = str(value or "").strip()
    return value[:limit]


def clamp_chunk_args(args: Any = None, default_chars: int = DEFAULT_CHUNK_CHARS) -> tuple[int, int]:
    """Normalize model-controlled chunk arguments to ``(offset, chunk_chars)``.

    Shared by the hook (lease grant) and the handler (lease take) so both
    compute the identical lease parameter from the same raw arguments.
    """
    values = args if isinstance(args, dict) else {}
    try:
        offset = int(values.get("offset") or 0)
    except (TypeError, ValueError):
        offset = 0
    offset = max(0, min(offset, _MAX_OFFSET))
    try:
        chunk = int(values.get("chunk_chars") or default_chars)
    except (TypeError, ValueError):
        chunk = default_chars
    chunk = max(MIN_CHUNK_CHARS, min(MAX_CHUNK_CHARS, chunk))
    return offset, chunk


class CaptureStore:
    """Bounded shelf of full-page captures, fenced by principal+session."""

    def __init__(
        self,
        *,
        ttl_seconds: float = DEFAULT_CAPTURE_TTL_SECONDS,
        upload_ttl_seconds: float = DEFAULT_UPLOAD_CAPTURE_TTL_SECONDS,
        max_captures: int = DEFAULT_MAX_CAPTURES,
        max_per_session: int = DEFAULT_MAX_CAPTURES_PER_SESSION,
        max_chars: int = DEFAULT_MAX_CAPTURE_CHARS,
        max_bytes: int = DEFAULT_MAX_CAPTURE_BYTES,
        chunk_chars: int = DEFAULT_CHUNK_CHARS,
        clock: Callable[[], float] = time,
    ) -> None:
        self._ttl_seconds = max(1.0, float(ttl_seconds))
        self._upload_ttl_seconds = max(1.0, float(upload_ttl_seconds))
        self._max_captures = max(1, int(max_captures))
        self._max_per_session = max(1, int(max_per_session))
        self._max_chars = max(1000, int(max_chars))
        self._max_bytes = max(1000, int(max_bytes))
        self._chunk_chars = max(MIN_CHUNK_CHARS, min(MAX_CHUNK_CHARS, int(chunk_chars)))
        self._clock = clock
        self._enabled = True
        self._captures: OrderedDict[str, _Capture] = OrderedDict()
        self._pending: OrderedDict[tuple[str, str], _PendingCapture] = OrderedDict()
        self._lock = threading.RLock()

    def configure(
        self,
        *,
        enabled: Optional[bool] = None,
        ttl_seconds: Optional[float] = None,
        max_chars: Optional[int] = None,
        chunk_chars: Optional[int] = None,
    ) -> None:
        with self._lock:
            if enabled is not None:
                self._enabled = bool(enabled)
            if ttl_seconds is not None:
                self._ttl_seconds = max(1.0, float(ttl_seconds))
            if max_chars is not None:
                self._max_chars = max(1000, int(max_chars))
            if chunk_chars is not None:
                self._chunk_chars = max(MIN_CHUNK_CHARS, min(MAX_CHUNK_CHARS, int(chunk_chars)))

    def _prune_locked(self, now: float) -> None:
        for capture_id, capture in list(self._captures.items()):
            if capture.expires_at <= now:
                del self._captures[capture_id]
        for key, pending in list(self._pending.items()):
            if pending.expires_at <= now:
                pending.text = ""
                del self._pending[key]

    def _evict_locked(self, fence: tuple[str, str]) -> None:
        while len(self._captures) > self._max_captures:
            self._captures.popitem(last=False)
        same = [cid for cid, capture in self._captures.items() if capture.fence == fence]
        while len(same) > self._max_per_session:
            self._captures.pop(same.pop(0), None)

    def upload(self, session_id: Any, text: Any) -> dict[str, Any]:
        """Park one uploaded capture for ``session_id``; metadata-only answer."""
        if not self._enabled:
            return {"available": False, "reason": "Capture chunking is disabled."}
        session = _trusted(session_id)
        if not session or not isinstance(text, str) or not text.strip():
            return {"available": False, "reason": "Capture upload needs a session id and non-empty text."}
        byte_length = len(text.encode("utf-8", "ignore"))
        if len(text) > self._max_chars or byte_length > self._max_bytes:
            return {
                "available": False,
                "reason": "Capture text exceeds the configured bound.",
                "max_chars": self._max_chars,
                "max_bytes": self._max_bytes,
            }
        capture_id = secrets.token_hex(16)
        now = self._clock()
        with self._lock:
            self._prune_locked(now)
            self._pending[(session, capture_id)] = _PendingCapture(
                capture_id=capture_id,
                session_id=session,
                text=text,
                total_chars=len(text),
                clipped=False,
                created_at=now,
                expires_at=now + self._upload_ttl_seconds,
            )
            while len(self._pending) > self._max_captures:
                dropped = self._pending.popitem(last=False)
                dropped[1].text = ""
            same_session = [key for key in self._pending if key[0] == session]
            while len(same_session) > self._max_per_session:
                oldest = same_session.pop(0)
                dropped = self._pending.pop(oldest, None)
                if dropped is not None:
                    dropped.text = ""
            return {
                "available": True,
                "capture_id": capture_id,
                "max_chars": self._max_chars,
                "chunk_chars": self._chunk_chars,
                "expires_in_seconds": int(self._upload_ttl_seconds),
                "adopts": "named-turn",
            }

    def adopt_or_refresh(self, capture_id: Any, owner: Any) -> bool:
        """Bind a pending capture to this turn's session fence, or refresh it.

        Called only from trusted hook code with the turn's owner.  A capture
        already bound to the same fence gets its TTL extended; a capture bound
        to another fence is refused without leaking existence.
        """
        normalized_id = _trusted(capture_id, _CAPTURE_ID_CHARS).lower()
        if not normalized_id or owner is None:
            return False
        fence = (_trusted(owner.principal_id), _trusted(owner.session_id))
        if not fence[1]:
            return False
        now = self._clock()
        with self._lock:
            self._prune_locked(now)
            pending = self._pending.pop((owner.session_id, normalized_id), None)
            if pending is not None:
                text = pending.text
                pending.text = ""
                self._captures[normalized_id] = _Capture(
                    capture_id=normalized_id,
                    fence=fence,
                    text=text,
                    total_chars=pending.total_chars,
                    clipped=pending.clipped,
                    created_at=now,
                    expires_at=now + self._ttl_seconds,
                )
                self._evict_locked(fence)
                return True
            existing = self._captures.get(normalized_id)
            if existing is not None and existing.fence == fence:
                self._captures[normalized_id] = replace(existing, expires_at=now + self._ttl_seconds)
                self._captures.move_to_end(normalized_id)
                return True
            return False

    def read_chunk(self, capture_id: Any, owner: Any, offset: Any, chunk_chars: Any) -> Optional[dict[str, Any]]:
        """Read one bounded slice; repeatable, never consuming, fence-checked."""
        normalized_id = _trusted(capture_id, _CAPTURE_ID_CHARS).lower()
        if not normalized_id or owner is None:
            return None
        fence = (_trusted(owner.principal_id), _trusted(owner.session_id))
        offset, chunk = clamp_chunk_args({"offset": offset, "chunk_chars": chunk_chars}, self._chunk_chars)
        with self._lock:
            capture = self._captures.get(normalized_id)
            if capture is None or capture.expires_at <= self._clock() or capture.fence != fence:
                return None
            self._captures.move_to_end(normalized_id)
            total = capture.total_chars
            if offset >= total:
                return {
                    "available": True,
                    "capture_id": normalized_id,
                    "offset": offset,
                    "chunk": "",
                    "chunk_chars": chunk,
                    "total_chars": total,
                    "clipped": capture.clipped,
                    "has_more": False,
                    "next_offset": None,
                }
            end = min(offset + chunk, total)
            return {
                "available": True,
                "capture_id": normalized_id,
                "offset": offset,
                "chunk": capture.text[offset:end],
                "chunk_chars": chunk,
                "total_chars": total,
                "clipped": capture.clipped,
                "has_more": end < total,
                "next_offset": end if end < total else None,
            }

    def status_for_owner(self, owner: Any) -> dict[str, Any]:
        """Metadata only: how many captures this fence holds and their ages."""
        fence = ((_trusted(getattr(owner, "principal_id", ""))), _trusted(getattr(owner, "session_id", "")))
        now = self._clock()
        with self._lock:
            self._prune_locked(now)
            held = [capture for capture in self._captures.values() if capture.fence == fence]
            newest = max(held, key=lambda capture: capture.created_at, default=None)
            return {
                "available": bool(held),
                "captures": len(held),
                "newest_age_ms": max(0, int((now - newest.created_at) * 1000)) if newest else None,
                "expires_in_ms": max(0, int((newest.expires_at - now) * 1000)) if newest else None,
                "chunk_chars": self._chunk_chars,
                "max_chars": self._max_chars,
            }