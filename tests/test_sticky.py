# tests/test_sticky.py
import sys
from importlib import reload
from pathlib import Path
from datetime import datetime, timedelta, timezone

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import app.countdown as cd
import app.storage as st

def test_sticky_target_failsafe(monkeypatch, tmp_path):
    monkeypatch.setenv("COUNTDOWN_CONFIG", str(tmp_path/"config.json"))
    reload(st)
    reload(cd)

    # Sett gyldig mål ~30s fram
    now = datetime.now(timezone.utc)
    cfg = st.save_target_datetime(int((now + timedelta(seconds=30)).timestamp()*1000))
    t1 = cd.compute_tick(cfg)
    assert t1["state"] == "running"
    # Simuler at noen nullstiller config på disk
    st.save_config({"target_ms": 0, "target_datetime": "", "target_iso": "", "__source": "test_null"})
    cfg2 = st.load_config()
    # Sticky bør holde oss i "running"
    t2 = cd.compute_tick(cfg2)
    assert t2["state"] in ("running", "alert", "warn")
    assert t2["display_ms"] > 0
