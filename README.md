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
- `public/styles.css`: shared styling
- `data/uploads/`: uploaded photos stored locally

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start the app:

```bash
npm start
```

3. Watch the console output. It will show local network URLs like:

```text
http://192.168.1.25:3000
```

4. Share that URL with guests on the same Wi-Fi.
5. Open `http://YOUR-IP:3000/display.html` on the laptop connected to the TV or mirrored to Roku.

## Party flow

1. Put a sign near the entrance with the Wi-Fi name, password, and upload URL.
2. Keep the laptop plugged in and disable sleep.
3. Test an upload from one phone before guests arrive.
4. If the Roku supports AirPlay, mirror from a Mac, iPhone, or iPad.
5. If AirPlay is not available, use screen mirroring from the laptop or connect the laptop directly by HDMI.

## Notes

- Uploads are local to the machine running the app.
- On Vercel, uploads go to temporary storage and are not durable across cold starts or redeploys.
- The app accepts up to 10 images per upload request and 25 MB per image.
- The slideshow polls every few seconds for new photos.
- `data/uploads/` is ignored by git so party photos stay local.
