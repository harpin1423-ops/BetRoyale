const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function processIcons() {
  const input = path.join(__dirname, 'public', 'logo_final_80.png');
  const publicDir = path.join(__dirname, 'public');

  if (!fs.existsSync(input)) {
    console.error("Input file not found:", input);
    return;
  }

  try {
    // Trim removes transparent pixels around the logo.
    console.log("Trimming logo...");
    const trimmedBuffer = await sharp(input)
      .trim()
      .toBuffer();

    console.log("Generating icons...");
    const sizes = [
      { name: 'favicon-16.png', size: 16 },
      { name: 'favicon-32.png', size: 32 },
      { name: 'favicon-48.png', size: 48 },
      { name: 'apple-touch-icon.png', size: 180 },
      { name: 'icon-512.png', size: 512 },
      { name: 'icon-1024.png', size: 1024 },
    ];

    for (const s of sizes) {
      await sharp(trimmedBuffer)
        .resize(s.size, s.size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent padding if aspect ratio isn't perfectly 1:1
        })
        .toFile(path.join(publicDir, s.name));
      console.log(`Created ${s.name}`);
    }

    // Replace favicon.ico with the 32x32 version (browsers handle PNGs renamed to ICO fine, or just as a fallback)
    fs.copyFileSync(path.join(publicDir, 'favicon-32.png'), path.join(publicDir, 'favicon.ico'));
    console.log("Created favicon.ico fallback");

    console.log("Done!");
  } catch (error) {
    console.error("Error processing icons:", error);
  }
}

processIcons();
