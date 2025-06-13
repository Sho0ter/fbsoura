const fs = require('fs');
const path = require('path');
const axios = require('axios');
const archiver = require('archiver');

/**
 * Downloads multiple images and saves them as a zip file
 * @param {Array} imageUrls - Array of image URLs to download
 * @param {string} outputPath - Path to save the zip file
 * @returns {Promise<string>} - Path to the created zip file
 */
async function downloadImagesToZip(imageUrls, outputPath) {
  // Create a write stream for the zip file
  const output = fs.createWriteStream(outputPath);
  const archive = archiver('zip', {
    zlib: { level: 9 } // Maximum compression
  });

  // Set up archive events
  archive.pipe(output);
  
  // Counter for unique filenames
  let counter = 1;
  
  // Download each image and add to the archive
  for (const imageUrl of imageUrls) {
    try {
      // Download the image
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
          'Accept': 'image/jpeg,image/png,image/webp,*/*'
        }
      });
      
      // Determine file extension based on content type
      const contentType = response.headers['content-type'] || 'image/jpeg';
      const ext = contentType.includes('png') ? '.png' : '.jpg';
      
      // Create a unique filename
      const filename = `profile_image_${counter}${ext}`;
      counter++;
      
      // Add the buffer to the archive
      archive.append(response.data, { name: filename });
      
      console.log(`Added ${filename} to zip archive`);
    } catch (error) {
      console.error(`Failed to download image ${imageUrl}:`, error.message);
      // Continue with other images if one fails
    }
  }
  
  // Finalize the archive
  await archive.finalize();
  
  return new Promise((resolve, reject) => {
    output.on('close', () => {
      console.log(`Zip archive created: ${outputPath}, size: ${archive.pointer()} bytes`);
      resolve(outputPath);
    });
    
    archive.on('error', (err) => {
      reject(err);
    });
  });
}

module.exports = {
  downloadImagesToZip
};
