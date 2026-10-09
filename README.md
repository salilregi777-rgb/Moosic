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

Vercel is linked to this GitHub repository. Production can be updated from a local build or a push to the linked branch. Existing private accounts and libraries still require the old database backup to import.

## Dark rooms, artwork, and demo Premium

The homepage uses a dimensional mood-disc carousel with arrow-key, swipe, wheel, and button navigation. One disc is visible at rest; neighboring discs enter as you scroll. Only the hovered disc follows the cursor through damped 3D motion. Surface highlights move with its pose, and the metallic reverse includes fine grooves and etched mastering marks. Idle discs stop updating. Use Space or Flip disc to reveal the reflective reverse. Mood and saved themes share near-black backgrounds, muted accents, and one matching React Bits effect (Aurora, Particles, Waves, Threads, or Iridescence). Effects stop in hidden tabs and respect reduced-motion preferences. Component licensing is preserved in `public/third-party-notices.txt` in the maintained app.

Song artwork appears on the animated disc, player, queue, search results, playlist covers, and downloaded-song list. Uploaded cover art takes priority; YouTube-backed songs fall back to their video thumbnail. The disc rotates only while the media player reports playback, pauses on buffering/errors, and stays still for reduced-motion users.

Premium uses an explicitly labeled demo payment. Choose **Unlock Premium**, enter test card **4242 4242 4242 4242**, a current or future **MM/YY** expiry, and test CVV **123**. Card fields stay in the browser and are never sent or stored. Download adds a song reference to the account’s Downloads list; Play streams it through the same player without saving a media file to the device. Successful simulation enables Premium in Supabase; **Cancel Premium** removes demo access. No real charge or recurring payment is created.

Catalog source repairs preserve song IDs and playlists. The second repair manifest records unresolved title/artist pairs. The Low Battery migration retires Pathikada Sandhya, Gunjan Gaun, and Rn Samayal while preserving their library relationships, and adds seven verified mellow selections. Khuda ke Liye, Dil Ruba, and Mere Naam still need corrected links or approval to replace them. The Low Battery migration is applied to the live project; see the backend deployment status. External video availability can also vary by region or provider; playback errors keep the selected song and offer retry instead of silently skipping it. Managed audio uploads provide a provider-independent option.

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
