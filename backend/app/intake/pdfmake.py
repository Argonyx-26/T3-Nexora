"""A tiny text-only PDF writer (no dependencies) for sample reports and tests."""

from __future__ import annotations


def _esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def make_pdf(lines: list[str], title_lines: int = 1) -> bytes:
    """One A4 page; the first `title_lines` lines are set larger and bold."""
    y = 800
    ops = ["BT"]
    for i, line in enumerate(lines):
        size = 16 if i < title_lines else 11
        font = "/F2" if i < title_lines or line.endswith(":") else "/F1"
        ops.append(f"{font} {size} Tf 1 0 0 1 56 {y} Tm ({_esc(line)}) Tj")
        y -= 24 if i < title_lines else 17
    ops.append("ET")
    stream = "\n".join(ops).encode("latin-1", "replace")
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return bytes(out)


SAMPLE_REPORT = [
    "City General Hospital - Admission Summary (SAMPLE, synthetic data)",
    "Patient Name: Anita Sharma",
    "Age: 61 years      Sex: Female      IP No: 24-1187",
    "Date: 26/09/2026   Ward: Medicine",
    "Presenting complaints:",
    "Breathlessness for 2 days, cough with sputum, fever with chills since last night.",
    "Past history:",
    "2014 - Hypertension diagnosed",
    "2019 - Type 2 diabetes diagnosed",
    "Vitals on admission:",
    "BP: 168/98 mmHg    Pulse: 108 /min    Resp. Rate: 24 /min",
    "SpO2: 93% on room air    Temp: 101.2 F    RBS: 245 mg/dL",
    "Current medications:",
    "Tab Metformin 500 mg BD",
    "Tab Amlodipine 5 mg OD",
    "Inj Insulin Glargine 18 units HS",
    "Tab Paracetamol 650 mg TDS for fever",
    "Impression: Suspected community-acquired pneumonia in a known hypertensive, diabetic patient.",
    "Plan: chest X-ray, blood cultures, start antibiotics as per protocol.",
]


if __name__ == "__main__":  # python -m app.intake.pdfmake → writes the sample report
    import pathlib

    path = pathlib.Path(__file__).resolve().parents[3] / "samples" / "sample-admission-report.pdf"
    path.write_bytes(make_pdf(SAMPLE_REPORT))
    print(f"wrote {path}")
