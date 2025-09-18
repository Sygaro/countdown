from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional, Dict, Any


@dataclass
class Config:
    # Kjernetid – bruk én av disse: daily_time (HH:MM) eller target_datetime (ISO8601)
    daily_time: Optional[str] = None
    target_datetime: Optional[str] = None

    # UI-innstillinger
    message_primary: str = ""
    message_secondary: str = ""
    show_message_primary: bool = True
    show_message_secondary: bool = False

    # Farger/varsler (minutter/sekunder)
    warn_minutes: int = 3
    alert_minutes: int = 1
    blink_seconds: int = 15  # blink siste N sekunder før mål

    # Etter tiden er passert – hvor lenge vises minus (overrun)
    overrun_minutes: int = 5

    # Admin-passord (plain, behold eksisterende mekanisme om du har)
    admin_password: Optional[str] = None

    # Andre frie felt bevares her
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        base = {
            "daily_time": self.daily_time,
            "target_datetime": self.target_datetime,
            "message_primary": self.message_primary,
            "message_secondary": self.message_secondary,
            "show_message_primary": self.show_message_primary,
            "show_message_secondary": self.show_message_secondary,
            "warn_minutes": self.warn_minutes,
            "alert_minutes": self.alert_minutes,
            "blink_seconds": self.blink_seconds,
            "overrun_minutes": self.overrun_minutes,
            "admin_password": self.admin_password,
        }
        base.update(self.extra)
        return base
