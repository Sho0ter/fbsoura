## Facebook Profile Image Downloader

Download Facebook profile images by username or profile URL using Node.js.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Usage:
   ```bash
   node index.js <facebook_username_or_url>
   ```
   Example:
   ```bash
   node index.js zuck
   node index.js https://facebook.com/zuck
   ```

The profile image will be saved in the current directory as `<username>_profile.jpg` (or the correct extension).

## Notes
- Only works for public profiles or those not restricted by privacy settings.
- Uses the Facebook Graph API's public image endpoint.
- For private or restricted profiles, image download may fail.
