# Graduation Party Album

This project gives you a simple local photo wall for the party:

- Guests open an upload page on their phones and add pictures.
- A slideshow page updates itself as new photos arrive.
- You show the slideshow on the TV by mirroring or AirPlaying the slideshow screen to the Roku.

## Why mirror to Roku instead of running on Roku directly?

Roku does not provide a normal web browser you can reliably deploy this kind of live upload app to. The practical setup is:

1. Run this app on a laptop on the same Wi-Fi as the guests.
2. Open the slideshow page on that laptop.
3. Mirror the laptop screen to the Roku, or use AirPlay if your Roku supports it.

If you later want a true Roku channel, that is a separate BrightScript app build.

## Structure

- `server.js`: Node server for file uploads and photo listing
- `public/index.html`: guest upload page
- `public/display.html`: TV slideshow page
- `public/manage.html`: bulk photo review and deletion page
- `public/styles.css`: shared styling
- `data/uploads/`: local fallback storage when Supabase is not configured

## Setup

1. Install dependencies:

```bash
npm install
```

2. Optional: configure Supabase Storage for durable uploads.

Create a public Storage bucket in Supabase and make sure these environment variables are available to the app:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY`
- `SUPABASE_BUCKET` (optional, defaults to `gradpic-media`)

For local development, add it to a `.env` file or your shell environment:

```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
export SUPABASE_PUBLISHABLE_KEY=your_publishable_key_here
export SUPABASE_BUCKET=gradpic-media
```

The bucket should be set to `Public` so the slideshow can serve files directly.

If you do not set the Supabase variables, the app falls back to local disk storage in `data/uploads/`.

3. Start the app:

```bash
npm start
```

4. Watch the console output. It will show local network URLs like:

```text
http://192.168.1.25:3000
```

5. Share that URL with guests on the same Wi-Fi.
6. Open `http://YOUR-IP:3000/display.html` on the laptop connected to the TV or mirrored to Roku.

## Party flow

1. Put a sign near the entrance with the Wi-Fi name, password, and upload URL.
2. Keep the laptop plugged in and disable sleep.
3. Test an upload from one phone before guests arrive.
4. If the Roku supports AirPlay, mirror from a Mac, iPhone, or iPad.
5. If AirPlay is not available, use screen mirroring from the laptop or connect the laptop directly by HDMI.

## Notes

- With Supabase configured, uploads are stored durably in Supabase Storage.
- Without Supabase configured, uploads stay local to the machine running the app.
- The app accepts up to 10 media files per upload request.
- Local fallback mode limits each file to 150 MB.
- The slideshow polls every few seconds for new photos.
- The moderation page is available at `/manage.html`.
- `data/uploads/` is ignored by git so local fallback photos stay out of git.
