# PPE Compliance Monitor

Real-time AI system that detects whether workers are wearing required PPE — helmets, gloves, goggles, boots, and vests.

## Overview

This system uses a custom-trained YOLOv8 model to analyse live camera feeds and uploaded videos/images, identifying which pieces of personal protective equipment (PPE) are present or missing on workers. A React dashboard displays detections in real time and triggers alerts when compliance violations are found.

**Detectable PPE items:** Helmet · Gloves · Goggles · Safety Boots · High-Visibility Vest

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | React 19 + Vite + Tailwind CSS | Latest |
| Charts | Recharts | Latest |
| Backend | Node.js + Express.js | v22 / v4 |
| Database | SQLite3 (better-sqlite3) | Latest |
| AI Engine | Python Flask + Ultralytics YOLOv8 | v3.13 / v8.4 |
| Model Format | PyTorch (.pt) | YOLOv8s best.pt |
| Alerts | Web Audio API, Nodemailer, ntfy.sh, Twilio | N/A |

---

## Prerequisites

| Software | Version |
|---|---|
| Node.js | v18.0+ (v22 recommended) |
| Python | v3.10+ (v3.13 recommended) |
| npm | Included with Node.js |
| pip | Included with Python |

---

## Installation & Setup

### Step 1 — Open the project in VS Code

Open the extracted project folder in VS Code via **File > Open Folder**.

### Step 2 — Open the integrated terminal

Go to **Terminal > New Terminal** in the top menu.

### Step 3 — Navigate to the dashboard folder

```bash
cd main\dashboard
```

### Step 4 — Install all dependencies (first time only)

```bash
npm run install-all
```

This downloads all AI libraries and dashboard tools. It may take **2–5 minutes**.

### Step 5 — Launch the system

```bash
npm start
```

This boots the AI engine, database, and web server together. Wait for:
```
[REACT] ➜ Local: http://localhost:3000/
```

Then **Ctrl + Click** the link to open the dashboard in your browser.

### Step 6 — Shut down safely

In the terminal, press **Ctrl + C**, then **Enter**.

---

## Using the Dashboard

| Tab | Description |
|---|---|
| **Live Feed** | Streams from your webcam and draws bounding boxes in real time. Green = compliant, Red = violation, Grey = person detected. |
| **Upload** | Analyse a local video or image file. Adjust confidence and overlap sliders to tune sensitivity. |
| **Events** | Chronological log of all detected violations with timestamp, worker ID, violation type, severity, and confidence. |
| **Reports** | KPI cards, violation trend charts, and worker compliance tables. Filter by date range and export as CSV. |
| **Alert Settings** | Configure audio alarm, email (Gmail SMTP), push notifications (ntfy.sh), and SMS (Twilio). Default cooldown: 60 seconds. |

---

## Troubleshooting

**"Missing script" when running `npm run install-all`**
You skipped Step 3. Run `cd main\dashboard` first, then retry.

**"Port 3000 is already in use"**
Another terminal is already running the dashboard. Close all terminals (trash icon), open a new one, navigate to the dashboard folder, and run `npm start` again.

**"Python is not recognised as an internal or external command"**
Python is not installed or not registered. Install it, restart your computer, and try again.

**AI boxes don't appear immediately after uploading a video**
The model takes 5–10 seconds to load on first use. Subsequent videos load instantly.

---

## Project Structure

```
ppe-safety-prototype/
├── main/
│   └── dashboard/
│       ├── server/
│       │   ├── ai_engine.py   # Flask AI inference server (YOLOv8)
│       │   ├── index.ts       # Node.js / Express backend
│       │   └── db.ts          # SQLite database layer
│       └── src/               # React frontend components
```
