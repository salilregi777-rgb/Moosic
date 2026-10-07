<img width="767" height="570" alt="moosic final" src="https://github.com/user-attachments/assets/c98270de-1101-4da1-a0d7-8a1921697286" />

## Run the maintained app

Moosic now uses Supabase Auth, Postgres, Storage, and the `api` Edge Function. The maintained frontend is `Frontend/MOOSIC-visual-refresh-final/MOOSIC-visual-refresh/artifacts/moodsic`; the old Python backend and `moodsic-app` sources are retained as migration references. The old `moodsic-app` package scripts forward to the maintained app.

Use Node 22.16+ and pnpm. From this repository root:

```sh
pnpm run setup
cp Frontend/MOOSIC-visual-refresh-final/MOOSIC-visual-refresh/artifacts/moodsic/.env.example Frontend/MOOSIC-visual-refresh-final/MOOSIC-visual-refresh/artifacts/moodsic/.env.local
# Fill in your Supabase project URL and publishable key.
pnpm dev
```

Open `http://localhost:5173`. Run `pnpm build` for production and `pnpm test` for playback regression tests. Root `vercel.json` selects the maintained frontend and supports client-side routes. Set the same public environment variables in Vercel before deploying.

See [Supabase setup, migration, and verification](supabase/README.md) for backend deployment, existing-account imports, manager access, and database tests. Existing YouTube videos remain streams; upload audio files you have permission to stream through Manager → Songs → Edit to store music in Supabase.

## Live website and future updates

The maintained app is deployed at [moosic-xi.vercel.app](https://moosic-xi.vercel.app). You can continue changing the website after deployment. From this linked repository, test and publish an update with:

```sh
pnpm test
pnpm build:vercel
pnpm dlx vercel@62.4.0 deploy --prebuilt --prod --scope salilregi777-8318s-projects
```

Use the same Supabase URL and publishable key in the maintained frontend's `.env.local` before building. Each production deployment updates the same website URL. Accounts, playlists, and uploaded media remain in Supabase; frontend deployment does not replace that data. Deploy database migrations and the `api` Edge Function separately when their code changes, following the [backend guide](supabase/README.md).

The current deployment was built from this local checkout. Vercel is linked to the GitHub repository, but these changes have not been pushed there yet; push the updated source before relying on Git-triggered deployments. Existing private accounts and libraries still require the old database backup to import.

# 🐄 Moosic
### *Your Daily Dose of Moo-sic.*

> **Music should adapt to you—not the other way around.**

Moosic is a personalized music streaming platform designed to make every listening session feel unique. It combines music discovery, intelligent recommendations, playlist management, and personalization into one simple experience.

---

## 🎵 Why Moosic?

Most music platforms focus on delivering songs.

**Moosic focuses on delivering experiences.**

The platform learns from user listening habits, preferences, genres, artists, and moods to create a more personalized music experience while keeping everyday actions simple and intuitive.

---

## ✨ Key Features

### 🤖 AI Playlist Naming
Generate creative playlist names based on the **mood, genre, and vibe** of the songs in a playlist.

### 🎨 Dynamic Themes
Customize the appearance of Moosic or receive theme suggestions based on your listening preferences and mood.

### 🗑️ Playlist Recovery
Accidentally deleted a playlist? Recover it instead of losing your carefully curated collection.

### ❤️ Personalized Recommendations
Moosic uses listening behaviour, favourite artists, genres, and moods to provide more relevant music recommendations.

### 🔒 Private Accounts & Playlists
User accounts and playlists are designed with privacy and controlled access in mind.

### 🎧 Simple & Intuitive Experience
Discover music, create playlists, manage your library, and listen without unnecessary complexity.

---

## 🏗️ Digital Business System

Moosic was developed as a **Digital Business Systems** project to demonstrate how different information systems work together within a modern digital platform.

| System | Role in Moosic |
|---|---|
| **TPS** | Captures user interactions and listening activity |
| **MIS** | Organizes and processes operational data |
| **DSS** | Supports personalized recommendations |
| **Enterprise Systems** | Supports efficient business operations |
| **E-Business Platform** | Provides the digital music experience |

Together, these systems transform user interactions into **data, insights, personalization, and business value**.

---

## 🛠️ Project Focus

Moosic demonstrates:

- User authentication and authorization
- Music and playlist management
- Persistent database storage
- Personalized recommendations
- Business data processing
- AI-assisted features
- Scalable digital architecture
- Secure user accounts and private playlists

---

## 🎯 Our Vision

We believe technology should enhance the way people connect with music—not complicate it.

**Moosic aims to make every playlist personal, every recommendation meaningful, and every listening session uniquely yours.**

> *Because music isn't just something you listen to—it's something you live.*

---

## 👥 Team

- **Erin Braggs**
- **Manmeet Kaur Oberoi**
- **Siya Anand**
- **Srinidhi Susarla**
- **Udditee Kapoor**

---

### 🐄 Moosic
**Your Daily Dose of Moo-sic.**

**Check it out at** → [moosic-xi.vercel.app](https://moosic-xi.vercel.app)

You would need a good internet connection and a playable device.
