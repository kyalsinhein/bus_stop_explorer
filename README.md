# Bristol Bus Stop Explorer

![Bristol Bus](https://img.shields.io/badge/Bristol-Bus%20Explorer-blue) ![Web App](https://img.shields.io/badge/Web%20App-Live-brightgreen)

Bristol Bus Stop Explorer is a web-based application designed to help commuters and travelers easily find bus stops in Bristol. The app provides information about stop locations, nearby amenities, and schedules, making it easier for users to plan their journeys.

The main goal of the project is to save time and reduce confusion for people using public transport. Instead of checking multiple websites or wandering around the city, users can quickly locate nearby bus stops and access important information about them.

---

## How to run locally

```bash
pip install -r requirements.txt
python app.py          # uses a local SQLite file in instance/ when DATABASE_URL is not set
```

## Deploy to Vercel

1. Create a free Postgres database (Neon, Supabase, or Vercel Marketplace Postgres) and copy its connection string.
2. Push this folder to GitHub and import it at vercel.com/new (or run `vercel` with the CLI).
3. In **Project Settings → Environment Variables** add:
   - `SECRET_KEY` – a long random string (e.g. `python -c "import secrets; print(secrets.token_hex(32))"`)
   - `DATABASE_URL` – your Postgres connection string
4. Deploy. Tables are created automatically on first request.

Static files live in `public/static/` so Vercel serves them from its CDN.
Vercel's filesystem is read-only/ephemeral, which is why SQLite can't be used in production.

## 🚀 Key Features

- **Favourite Button** – Save your most-used routes or stops for quick access

- **Explore Bus Stops** – Browse all bus stops in Bristol with relevant details

- **Edit Profile** – Update your personal information and preferences easily

- **Nearby Bus Stops** – Find the closest bus stops based on your current location

- **Search by Authority Name** – Quickly locate buses or routes by the operating authority

- **Bus Name and Number Display** – See bus names and numbers in both table and map view

- **Clear Design** – Intuitive and user-friendly interface for smooth navigation

---

## ⚙️ Technologies Used

- HTML/CSS        
- JavaScript 
- Python     
