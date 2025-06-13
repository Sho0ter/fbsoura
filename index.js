const axios = require('axios');
const fs = require('fs');
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static('public'));

/**
 * Extract profile image URL from Facebook HTML response
 * @param {string} htmlContent - HTML content from Facebook profile page
 * @returns {string|null} - URL of the profile image if found, null otherwise
 */
function extractProfileImageFromHTML(htmlContent) {
  try {
    console.log('Analyzing HTML response to find image URL');
    
    // First pattern: og:image meta tag (most reliable)
    const ogImageMatch = htmlContent.match(/property="og:image"[^>]*content="([^"]+)"/i) || 
                        htmlContent.match(/name="twitter:image"[^>]*content="([^"]+)"/i) || 
                        htmlContent.match(/meta property="og:image" content="([^"]+)"/i);
    
    if (ogImageMatch && ogImageMatch[1]) {
      console.log('Found image URL via meta tag:', ogImageMatch[1]);
      return ogImageMatch[1];
    }
    
    // Second pattern: Look for scontent.fxx URLs (Facebook CDN)
    const scontentMatch = htmlContent.match(/https:\/\/scontent\.[^"']+\.(?:jpg|png|jpeg|gif)[^"']*/i);
    if (scontentMatch) {
      console.log('Found image URL via scontent CDN:', scontentMatch[0]);
      return scontentMatch[0].split('&amp;').join('&');
    }
    
    // Try to find other image patterns
    const patterns = [
      /\/(scontent[^"']+\.(?:jpg|png|jpeg|gif)[^"']*)/i,
      /\/profile(-|_)picture[^"']+\.(?:jpg|png|jpeg|gif)[^"']*/i,
      /\/static\/[^"']+\.(?:jpg|png|jpeg|gif)[^"']*/i,
      /\/safe_image[^"']+\.(?:jpg|png|jpeg|gif)[^"']*/i
    ];
    
    for (const pattern of patterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        const url = match[0];
        console.log('Found image URL with pattern:', url);
        // Clean up the URL if needed
        const cleanUrl = url.split('&amp;').join('&');
        return cleanUrl.startsWith('http') ? cleanUrl : `https://facebook.com${cleanUrl}`;
      }
    }
    
    // If nothing else works, look for ANY jpg image that might be the profile
    const anyImgMatch = htmlContent.match(/https:\/\/[^"']+\.jpg[^"']*/i);
    if (anyImgMatch) {
      console.log('Found fallback jpg image:', anyImgMatch[0]);
      return anyImgMatch[0].split('&amp;').join('&');
    }
    
    console.log('No image URL found in HTML content');
    return null;
  } catch (error) {
    console.error('Error extracting profile image from HTML:', error.message);
    return null;
  }
}

async function downloadFacebookProfileImage(profile, saveToFile = true) {
  console.log(`Started download process for: ${profile}`);
  
  // Set up a mobile user-agent to bypass restrictions
  const mobileUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone12,1;FBMD/iPhone;FBSN/iOS;FBSV/14.0;FBSS/2;FBID/phone;FBLC/en_US;FBOP/5]';
  
  // Config for HTML requests
  const axiosConfig = {
    headers: {
      'User-Agent': mobileUserAgent,
      'Accept': 'text/html,application/xhtml+xml,image/webp,*/*',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    },
    timeout: 15000,
    maxRedirects: 5
  };
  
  // Config for image requests
  const imageConfig = {
    ...axiosConfig,
    responseType: 'arraybuffer',
    headers: {
      ...axiosConfig.headers,
      'Accept': 'image/jpeg,image/png,image/webp,*/*',
      'Referer': 'https://www.facebook.com/',
      'sec-ch-ua': '"Not_A Brand";v="99", "Google Chrome";v="109"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'image',
      'sec-fetch-mode': 'no-cors',
      'sec-fetch-site': 'cross-site'
    }
  };
  
  // Direct URL handling logic
  const extractDirectImageUrl = (text) => {
    // Extract from pasted HTML or JSON containing a direct URL
    if (text.includes('"og:image"') || text.includes('property="og:image"')) {
      const match = text.match(/property="og:image"[^>]*content="([^"]+)"/i) || 
                   text.match(/name="twitter:image"[^>]*content="([^"]+)"/i);
      if (match && match[1]) {
        console.log('Extracted image URL from HTML/JSON content:', match[1]);
        return match[1];
      }
    }
    
    // Direct scontent URL pattern
    const scontentPattern = /https:\/\/scontent\.[^"'\s}]+\.(?:jpg|png|jpeg)/i;
    const scontentMatch = text.match(scontentPattern);
    if (scontentMatch) {
      console.log('Found direct scontent URL:', scontentMatch[0]);
      return scontentMatch[0].split('&amp;').join('&');
    }

    return null;
  };

  // First, try to extract a direct image URL from the input
  const directUrl = extractDirectImageUrl(profile);
  if (directUrl) {
    console.log('Direct image URL detected, downloading from:', directUrl);
    try {
      const imageResponse = await axios.get(directUrl, imageConfig);
      const contentType = imageResponse.headers['content-type'] || 'image/jpeg';
      const ext = contentType.includes('png') ? '.png' : '.jpg';
      const fileName = `facebook_profile${ext}`;
      
      if (saveToFile) {
        fs.writeFileSync(fileName, imageResponse.data);
      }
      
      return { 
        fileName, 
        buffer: imageResponse.data, 
        ext,
        contentType
      };
    } catch (error) {
      console.error('Direct URL download failed:', error.message);
      throw new Error(`Failed to download from direct URL: ${error.message}`);
    }
  }
  
  // Extract the profile URL or username
  let profileUrl = profile;
  let username = null;
  
  if (profile.includes('facebook.com')) {
    // Extract username from Facebook URL
    const match = profile.match(/facebook\.com\/(?:profile\.php\?id=(\d+)|([A-Za-z0-9_.-]+))/);
    if (match) {
      username = match[1] || match[2];
      console.log(`Extracted username: ${username}`);
    }
  } else {
    // Assume it's just a username
    username = profile;
    profileUrl = `https://m.facebook.com/${username}`;
  }
  
  if (!username && !profile.includes('facebook.com')) {
    throw new Error('Invalid Facebook profile URL or username');
  }
  
  // Try to get HTML content from the Facebook page
  try {
    console.log(`Fetching HTML from: ${profileUrl}`);
    const htmlResponse = await axios.get(profileUrl, axiosConfig);
    let htmlContent = htmlResponse.data;
    
    if (typeof htmlContent !== 'string') {
      if (Buffer.isBuffer(htmlContent)) {
        htmlContent = htmlContent.toString('utf8');
      } else {
        htmlContent = JSON.stringify(htmlContent);
      }
    }
    
    // Look for og:image or scontent URL pattern in the HTML
    let imageUrl = null;
    
    // Look for og:image meta tag first
    const ogMatch = htmlContent.match(/property="og:image"[^>]*content="([^"]+)"/i);
    if (ogMatch && ogMatch[1]) {
      imageUrl = ogMatch[1];
      console.log('Found og:image URL:', imageUrl);
    } else {
      // Look for scontent URL pattern
      const scontentMatch = htmlContent.match(/https:\/\/scontent\.[^"']+\.(?:jpg|png|jpeg)[^"']*/i);
      if (scontentMatch) {
        imageUrl = scontentMatch[0].split('&amp;').join('&');
        console.log('Found scontent URL:', imageUrl);
      }
    }
    
    if (imageUrl) {
      // Download the image from the found URL
      console.log(`Downloading image from: ${imageUrl}`);
      const imageResponse = await axios.get(imageUrl, imageConfig);
      const contentType = imageResponse.headers['content-type'] || 'image/jpeg';
      const ext = contentType.includes('png') ? '.png' : '.jpg';
      const fileName = username ? `${username}_profile${ext}` : `facebook_profile${ext}`;
      
      if (saveToFile) {
        fs.writeFileSync(fileName, imageResponse.data);
      }
      
      return { 
        fileName, 
        buffer: imageResponse.data, 
        ext,
        contentType
      };
    }
  } catch (error) {
    console.error('HTML extraction failed:', error.message);
  }
  
  // Fallback to direct URL methods if the HTML extraction failed
  const fallbackMethods = [
    // Method 1: Try mobile large picture
    async () => {
      if (!username) throw new Error('No username available for this method');
      const url = `https://m.facebook.com/${username}/picture?type=large&width=720`;
      console.log(`Trying fallback method 1: ${url}`);
      return await axios.get(url, imageConfig);
    },
    
    // Method 2: Try Graph API with redirect
    async () => {
      if (!username) throw new Error('No username available for this method');
      const url = `https://graph.facebook.com/${username}/picture?type=large&redirect=true`;
      console.log(`Trying fallback method 2: ${url}`);
      return await axios.get(url, imageConfig);
    },
  ];
  
  // Try the fallback methods
  for (const method of fallbackMethods) {
    try {
      const imageResponse = await method();
      const contentType = imageResponse.headers['content-type'] || 'image/jpeg';
      const ext = contentType.includes('png') ? '.png' : '.jpg';
      const fileName = username ? `${username}_profile${ext}` : `facebook_profile${ext}`;
      
      if (saveToFile) {
        fs.writeFileSync(fileName, imageResponse.data);
      }
      
      return { 
        fileName, 
        buffer: imageResponse.data, 
        ext,
        contentType
      };
    } catch (error) {
      console.error('Fallback method failed:', error.message);
    }
  }
  
  throw new Error('Unable to download Facebook profile image. Please try pasting the direct image URL from Facebook.');
}

// Endpoint to download profile image directly
app.get('/download', async (req, res) => {
  const profile = req.query.profile;
  if (!profile) {
    return res.status(400).json({ error: 'Missing profile parameter' });
  }
  
  console.log(`Processing download request for: ${profile}`);
  
  try {
    // If this is a direct Facebook CDN URL, we need to handle it with special headers
    if (profile.includes('scontent.') || profile.includes('fbcdn.net')) {
      console.log('Direct Facebook CDN URL detected, using special headers');
      
      // Mobile User-Agent for better access to resources
      const mobileUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone12,1;FBMD/iPhone;FBSN/iOS;FBSV/14.0;FBSS/2;FBID/phone;FBLC/en_US;FBOP/5]';
      
      // Special headers to bypass Facebook's 403 blocks
      const imageResponse = await axios.get(profile, {
        responseType: 'arraybuffer',
        timeout: 15000,
        maxRedirects: 5,
        headers: {
          'User-Agent': mobileUserAgent,
          'Accept': 'image/jpeg,image/png,image/webp,*/*',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Referer': 'https://www.facebook.com/',
          'sec-ch-ua': '"Not_A Brand";v="99", "Google Chrome";v="109"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'image',
          'sec-fetch-mode': 'no-cors',
          'sec-fetch-site': 'cross-site',
          'Origin': 'https://www.facebook.com'
        }
      });
      
      const contentType = imageResponse.headers['content-type'] || 'image/jpeg';
      const ext = contentType.includes('png') ? '.png' : '.jpg';
      const fileName = `facebook_profile${ext}`;
      
      // Set appropriate content type based on the image type
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Type', contentType);
      
      // Send the image data
      res.send(imageResponse.data);
      console.log(`Successfully processed direct CDN image download`);
    } else {
      // Standard download process for non-CDN URLs
      const { fileName, buffer, ext, contentType } = await downloadFacebookProfileImage(profile, false);
      
      // Set appropriate content type based on the image type
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Type', contentType || 'image/jpeg');
      
      // Send the image data
      res.send(buffer);
      console.log(`Successfully processed image download for ${profile}`);
    }
  } catch (err) {
    console.error(`Error during image download: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to fetch a URL and extract profile image
app.get('/extract', async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: 'Missing URL parameter' });
  }
  
  console.log(`Extracting profile image from URL: ${url}`);
  
  try {
    // Mobile User-Agent for better access to resources
    const mobileUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone12,1;FBMD/iPhone;FBSN/iOS;FBSV/14.0;FBSS/2;FBID/phone;FBLC/en_US;FBOP/5]';
    const axiosConfig = {
      headers: {
        'User-Agent': mobileUserAgent,
        'Accept': 'text/html,application/xhtml+xml,image/webp,*/*'
      },
      timeout: 15000,
      maxRedirects: 5
    };
    
    // Fetch the URL content
    const response = await axios.get(url, axiosConfig);
    const htmlContent = typeof response.data === 'string' ? response.data : 
                      (Buffer.isBuffer(response.data) ? response.data.toString('utf8') : 
                       JSON.stringify(response.data));
    
    // Helper function to normalize URL for comparison
    const normalizeUrl = (url) => {
      try {
        // Remove query parameters that don't affect image content
        // like dimension parameters, caching parameters, etc.
        let normalized = url.split('?')[0];
        
        // Remove common Facebook URL variations
        normalized = normalized.replace(/&_nc_[^&]+/g, '');
        normalized = normalized.replace(/\?_nc_[^&]+/g, '');
        normalized = normalized.replace(/&oh=[^&]+/g, '');
        normalized = normalized.replace(/&oe=[^&]+/g, '');
        
        // Normalize Facebook CDN URLs that might have different domains but same path
        normalized = normalized.replace(/https:\/\/[^/]+\.fbcdn\.net/, 'fbcdn');
        normalized = normalized.replace(/https:\/\/[^/]+\.xx\.fbcdn\.net/, 'fbcdn');
        
        return normalized;
      } catch (e) {
        console.error('Error normalizing URL:', e);
        return url;
      }
    };
    
    // Helper function to estimate image quality based on URL patterns
    const getImageQualityScore = (url, source) => {
      let score = 0;
      
      // Higher scores are better quality
      
      // Check for high-res indicators
      if (url.includes('1080x1080')) score += 30;
      else if (url.includes('720x720')) score += 25;
      else if (url.includes('width=720')) score += 20;
      else if (url.includes('width=') && /width=\d{3,}/.test(url)) score += 15;
      
      // Check for known high quality patterns
      if (url.includes('s960x960')) score += 20;
      if (url.includes('c0.0.1080.1080')) score += 20;
      if (url.includes('c0.0.720.720')) score += 15;
      
      // Penalize for low-res indicators
      if (url.includes('s40x40')) score -= 20;
      if (url.includes('s50x50')) score -= 20;
      if (url.includes('_s.')) score -= 15;
      if (url.includes('/safe_image')) score -= 15;
      if (url.includes('blur=40')) score -= 30;
      if (url.includes('blur=') && /blur=\d+/.test(url)) score -= 20;
      if (url.includes('filt_')) score -= 15;
      if (url.includes('_n.')) score -= 10; // Facebook's nomenclature for normal/lower quality

      // Penalize specific paths known to be for blurred images
      if (url.includes('/t1.0-1/')) score -= 10;
      if (url.includes('cp0_dst-jpg')) score -= 5;
      if (url.includes('lossy=1')) score -= 10;
      if (url.includes('_a.jpg')) score -= 5; // Facebook's album thumbnail suffix
      
      // Prefer original sources
      if (source === 'og:image') score += 10;
      
      return score;
    };
    
    // Track both unique URLs and their quality scores
    const imagesByNormalizedUrl = new Map(); // Map normalized URL to {url, source, quality}
    
    // Function to add URL if it's unique or higher quality than existing one
    const addImageIfBetter = (source, url) => {
      url = url.split('&amp;').join('&'); // Clean URL
      const normalizedUrl = normalizeUrl(url);
      if (!normalizedUrl) return false;
      
      const qualityScore = getImageQualityScore(url, source);
      
      // If this normalized URL already exists, only keep the higher quality version
      if (imagesByNormalizedUrl.has(normalizedUrl)) {
        const existing = imagesByNormalizedUrl.get(normalizedUrl);
        if (qualityScore > existing.quality) {
          // Replace with higher quality version
          imagesByNormalizedUrl.set(normalizedUrl, { url, source, quality: qualityScore });
          console.log(`Replaced image with higher quality version. Score: ${qualityScore}`);
          return true;
        }
        return false; // Lower quality duplicate
      } 
      
      // New unique URL
      imagesByNormalizedUrl.set(normalizedUrl, { url, source, quality: qualityScore });
      return true;
    };
    
    // Look for og:image meta tags
    const ogImageRegex = /property="og:image"[^>]*content="([^"]+)"/gi;
    let match;
    while ((match = ogImageRegex.exec(htmlContent)) !== null) {
      if (match[1]) addImageIfBetter('og:image', match[1]);
    }
    
    // Look for scontent URLs
    const scontentRegex = /https:\/\/scontent\.[^"'\s}]+\.(?:jpg|png|jpeg)[^"'\s}]*/gi;
    while ((match = scontentRegex.exec(htmlContent)) !== null) {
      addImageIfBetter('scontent', match[0]);
    }
    
    // Look for profile picture URLs
    const profilePicRegex = /\/profile(-|_)picture[^"']+\.(?:jpg|png|jpeg|gif)[^"']*/gi;
    while ((match = profilePicRegex.exec(htmlContent)) !== null) {
      const url = match[0];
      const fullUrl = url.startsWith('http') ? url : `https://facebook.com${url}`;
      addImageIfBetter('profile-picture', fullUrl);
    }
    
    // Additional pattern for high-quality FB images
    const highResRegex = /https:\/\/[^"'\s}]+\.(?:jpg|png|jpeg)(?:\?[^"'\s}]*(?:width=(?:720|1080)|height=(?:720|1080))[^"'\s}]*)?/gi;
    while ((match = highResRegex.exec(htmlContent)) !== null) {
      if (!match[0].includes('emoji') && !match[0].includes('icon') && match[0].length > 30) {
        addImageIfBetter('high-res', match[0]);
      }
    }
    
    // Create final image array from map
    const finalImages = [];
    for (const [, imageData] of imagesByNormalizedUrl.entries()) {
      // Only include images that don't have extremely negative quality scores
      // Negative scores indicate blurred or very low-quality images
      if (imageData.quality > -15) {
        finalImages.push({
          source: imageData.source,
          url: imageData.url,
          quality: imageData.quality // Optionally include the quality score for debugging
        });
      }
    }
    
    // Sort by quality score (highest quality first)
    finalImages.sort((a, b) => b.quality - a.quality);
    
    if (finalImages.length === 0) {
      return res.status(404).json({ error: 'No profile images found in the URL content' });
    }
    
    // Return the high-quality unique images 
    console.log(`Found ${finalImages.length} unique high-quality images from URL: ${url}`);
    res.json({ 
      url,
      imageCount: finalImages.length,
      images: finalImages
    });
    
  } catch (err) {
    console.error(`Error extracting from URL: ${err.message}`);
    res.status(500).json({ error: `Failed to process URL: ${err.message}` });
  }
});

// API endpoint for downloading multiple images as a zip
app.post('/download-all', express.json(), async (req, res) => {
  try {
    const { imageUrls } = req.body;
    
    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return res.status(400).json({ error: 'Missing or invalid imageUrls parameter' });
    }

    console.log(`Request to download ${imageUrls.length} images as zip`);
    
    // Create a unique filename for the zip
    const timestamp = Date.now();
    const zipFilename = `facebook_images_${timestamp}.zip`;
    const zipPath = path.join(__dirname, 'temp', zipFilename);
    
    // Download images and create zip
    const downloadImagesToZip = require('./download-helpers').downloadImagesToZip;
    await downloadImagesToZip(imageUrls, zipPath);
    
    // Set headers
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename=${zipFilename}`);
    
    // Send the file
    const fileStream = fs.createReadStream(zipPath);
    fileStream.pipe(res);
    
    // Clean up the file after sending
    fileStream.on('end', () => {
      fs.unlink(zipPath, (err) => {
        if (err) console.error(`Error removing temp file ${zipPath}:`, err);
      });
    });
  } catch (error) {
    console.error('Error in download-all endpoint:', error.message);
    res.status(500).json({ error: error.message || 'Failed to download images' });
  }
});

// CLI usage: node index.js <facebook_username_or_url>
if (process.env.RUN_SERVER) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Use /download?profile=<facebook_username_or_url> to download a profile image.');
  });
} else if (require.main === module) {
  const input = process.argv[2];
  if (!input) {
    console.log('Usage: node index.js <facebook_username_or_url>');
    process.exit(1);
  }
  downloadFacebookProfileImage(input)
    .then(({ fileName }) => console.log(`Downloaded profile image as ${fileName}`))
    .catch(err => console.error('Failed to download profile image:', err.message));
}
