✅ COMPLETE — 2026-05-31 — FAB centering + Cloudinary sync button + gallery hover arrows applied to collection.injector.js

# Collection Panel — Patch Instructions
# 3 changes to collection.injector.js + 1 new API file

---

## CHANGE 1 — Fix FAB plus icon centering

Find the FAB button CSS in collection.injector.js or index.html.
The yellow circle button with + icon has misaligned plus.

Find this (or similar):
```css
.collection-fab {
  /* existing styles */
}
```

Add/replace with:
```css
.collection-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #f0c040;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  line-height: 1;
  color: #0a0a18;
  box-shadow: 0 4px 16px rgba(240,192,64,0.4);
  z-index: 100;
}

.collection-fab::before {
  content: '+';
  display: block;
  line-height: 1;
  margin: 0;
  padding: 0;
}
```

If the FAB uses an <i> icon tag instead of ::before, replace the icon with
a plain text span:
```html
<button class="collection-fab" id="open-add-asset"><span style="line-height:1;font-size:24px;display:block">+</span></button>
```

---

## CHANGE 2 — Add Sync button to filter bar

Find the filter bar in collection.injector.js — the row containing
[All] [Holding] [For Sale] [Sold] + category dropdown.

Add this button at the far right of that row:
```javascript
// After the category dropdown, add:
const syncBtn = document.createElement('button');
syncBtn.id = 'cloudinary-sync-btn';
syncBtn.textContent = '⬆ Sync from Cloudinary';
syncBtn.style.cssText = [
  'margin-left:auto',
  'background:transparent',
  'border:.5px solid #2a2a4e',
  'border-radius:6px',
  'padding:4px 12px',
  'font-size:10px',
  'color:#85b7eb',
  'cursor:pointer',
  'white-space:nowrap'
].join(';');
syncBtn.onclick = function() {
  if (window.openCloudinarySync) {
    window.openCloudinarySync();
  } else {
    console.error('cloudinary-sync.js not loaded');
  }
};
filterBar.appendChild(syncBtn);
```

Also expose the collection refresh function globally so the sync script
can call it after import:
```javascript
// At the end of the collection init function, add:
window._collectionRefresh = function() {
  loadAssets(); // or whatever your fetch+render function is called
};
```

---

## CHANGE 3 — Gallery hover display on asset cards

In the renderAssets() or renderCard() function, update each card to
support gallery hover sliding.

For each asset card, replace the single image display with:

```javascript
function buildAssetCard(asset) {
  const f = asset.fields || {};
  const mainImage = f.cloudinary_image_url || '';

  // Parse gallery URLs
  let galleryUrls = [];
  if (f.cloudinary_gallery_urls) {
    try {
      galleryUrls = JSON.parse(f.cloudinary_gallery_urls);
    } catch (e) {
      galleryUrls = [];
    }
  }
  const allImages = mainImage ? [mainImage, ...galleryUrls] : galleryUrls;
  let currentImageIndex = 0;

  // Build card HTML
  const card = document.createElement('div');
  card.className = 'asset-card';
  card.dataset.id = asset.id;

  // Image container
  const imgWrap = document.createElement('div');
  imgWrap.className = 'asset-card-img-wrap';
  imgWrap.style.cssText = 'position:relative;overflow:hidden;border-radius:6px 6px 0 0;background:#111';

  if (allImages.length > 0) {
    const img = document.createElement('img');
    img.src = allImages[0];
    img.style.cssText = 'width:100%;height:140px;object-fit:cover;display:block;transition:opacity 0.2s';
    img.onerror = function() { this.style.display = 'none'; };
    imgWrap.appendChild(img);

    // Gallery counter badge
    if (allImages.length > 1) {
      const counter = document.createElement('div');
      counter.style.cssText = [
        'position:absolute;bottom:6px;right:6px',
        'background:rgba(0,0,0,0.6)',
        'color:#fff;font-size:9px',
        'padding:2px 6px;border-radius:3px'
      ].join(';');
      counter.textContent = '1 / ' + allImages.length;
      imgWrap.appendChild(counter);

      // Hover navigation
      imgWrap.addEventListener('mouseenter', function() {
        if (allImages.length <= 1) return;
        imgWrap._hoverActive = true;
      });

      imgWrap.addEventListener('mouseleave', function() {
        imgWrap._hoverActive = false;
        currentImageIndex = 0;
        img.src = allImages[0];
        counter.textContent = '1 / ' + allImages.length;
      });

      // Left/right arrows on hover
      const arrowLeft = document.createElement('button');
      arrowLeft.textContent = '‹';
      arrowLeft.style.cssText = [
        'position:absolute;left:4px;top:50%;transform:translateY(-50%)',
        'background:rgba(0,0,0,0.5);color:#fff;border:none',
        'border-radius:50%;width:22px;height:22px',
        'font-size:14px;cursor:pointer;opacity:0;transition:opacity 0.2s',
        'display:flex;align-items:center;justify-content:center;line-height:1'
      ].join(';');

      const arrowRight = document.createElement('button');
      arrowRight.textContent = '›';
      arrowRight.style.cssText = arrowLeft.style.cssText.replace('left:4px', 'right:4px');

      imgWrap.addEventListener('mouseenter', function() {
        arrowLeft.style.opacity = '1';
        arrowRight.style.opacity = '1';
      });
      imgWrap.addEventListener('mouseleave', function() {
        arrowLeft.style.opacity = '0';
        arrowRight.style.opacity = '0';
      });

      arrowLeft.onclick = function(e) {
        e.stopPropagation();
        currentImageIndex = (currentImageIndex - 1 + allImages.length) % allImages.length;
        img.style.opacity = '0';
        setTimeout(function() {
          img.src = allImages[currentImageIndex];
          img.style.opacity = '1';
          counter.textContent = (currentImageIndex + 1) + ' / ' + allImages.length;
        }, 150);
      };

      arrowRight.onclick = function(e) {
        e.stopPropagation();
        currentImageIndex = (currentImageIndex + 1) % allImages.length;
        img.style.opacity = '0';
        setTimeout(function() {
          img.src = allImages[currentImageIndex];
          img.style.opacity = '1';
          counter.textContent = (currentImageIndex + 1) + ' / ' + allImages.length;
        }, 150);
      };

      imgWrap.appendChild(arrowLeft);
      imgWrap.appendChild(arrowRight);
    }
  } else {
    // No image placeholder
    const placeholder = document.createElement('div');
    placeholder.style.cssText = 'width:100%;height:140px;display:flex;align-items:center;justify-content:center;color:#333;font-size:11px';
    placeholder.textContent = 'No image';
    imgWrap.appendChild(placeholder);
  }

  card.appendChild(imgWrap);

  // Rest of card content — keep existing structure
  // (name, category, status, value, etc.)
  // Just replace the image section with imgWrap above

  return card;
}
```

---

## NEW FILE — Upload to repo

Upload `functions/api/cloudinary-folders.js` to the functions/api/ folder.
This enables the sync script to call `/api/cloudinary-folders`.

Upload `public/assets/js/cloudinary-sync.js` to public/assets/js/.

Add this script tag to `public/index.html` just before </body>:
```html
<script src="/assets/js/cloudinary-sync.js"></script>
```

---

## TESTING CHECKLIST

After uploading all files and merging to main:

1. Go to Collection panel
2. Verify ⬆ Sync from Cloudinary button appears far right of filter bar
3. Click it → modal opens showing folder list
4. Verify Personal/Collections subfolders appear (Vice, Knives, Agave group etc.)
5. New folders show NEW badge in green, existing show exists in gray
6. Select a few folders → click Import selected
7. Watch log — should show ✓ Imported for each
8. Verify assets appear in Collection panel after import
9. Hover over an asset card with multiple images → arrows appear → sliding works
10. Verify FAB + is centered on yellow circle
