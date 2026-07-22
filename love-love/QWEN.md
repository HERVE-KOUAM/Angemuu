# QWEN.md — Project Context

## Project Overview

**Ange Muu** — A static, single-page website for a hair salon / styling business named "Ange Muu" (also referred to as "AngeMuu Arstyle"). The site is built on a customized version of the **LoveLove** wedding template (from WPOcean), repurposed into a modern salon landing page with French-language content.

### Key Features
- **Hero section** with brand name and tagline ("Élégance & modernité")
- **Couple/Showcase section** displaying salon imagery and a "Prendre RDV" (Book Appointment) CTA
- **About section** ("À propos") with brand story and history
- **Reservation / Appointment booking form** with fields for name, phone, location preference (on-site or home), number of guests, desired hairstyle, date picker, and time slot selector
- **Gallery** with lightbox (Fancybox) for browsing portfolio images
- **Footer** with navigation links, social media links (Facebook, Instagram), and copyright
- **Color switcher** widget for theme customization
- **Preloader** animation on page load
- **Responsive design** with mobile menu support

## Technologies & Dependencies

| Category | Details |
|----------|---------|
| **HTML/CSS/JS** | Static website — no build step or framework |
| **CSS Framework** | Bootstrap 5 (via CDN + local `bootstrap.min.css`) |
| **Icon Libraries** | Font Awesome, Themify Icons, Flaticon |
| **Animations** | WOW.js + Animate.css, custom moving-animation.js |
| **Sliders/Carousels** | Owl Carousel, Slick, Swiper |
| **Lightbox** | jQuery Fancybox |
| **Date Picker** | Bootstrap Datepicker (CDN, with French locale) |
| **Calendar Widget** | Custom date picker (`styledate.css`) |
| **Other Plugins** | jQuery UI, Nice Select, Odometer, Magnific Popup |
| **CDN Scripts** | Bootstrap 5.3, Popper.js, Tempus Dominus v6, AngularJS 1.0.4 |
| **Node Dependencies** | `@qwen-code/sdk`, `openai` (listed in `package.json`, likely unused in the static site) |

## Project Structure

```
love-love/
├── index.html              # Main landing page (all sections)
├── 404.html                # 404 error page
├── package.json             # Node dependencies (minimal)
├── .env                     # Environment file (empty)
├── assets/
│   ├── css/                 # Stylesheets (Bootstrap, plugins, custom)
│   ├── sass/style.css       # Compiled main theme styles
│   ├── js/                  # JavaScript (jQuery, plugins, custom scripts)
│   ├── images/              # All images (salon photos, icons, graphics)
│   └── fonts/               # Web fonts for icon libraries
└── node_modules/            # Installed npm packages
```

## Building and Running

This is a **static website** — no build step is required.

- **Local Development:** Open `index.html` directly in a browser, or serve it with a local dev server:
  ```bash
  npx serve .
  # or
  python -m http.server 8000
  ```
- **Production:** Deploy the entire directory to any static hosting provider (Netlify, Vercel, GitHub Pages, traditional web host, etc.).

## Development Conventions

- **No build tooling** — all CSS and JS are pre-compiled/minified. Editing is done directly in the HTML, CSS, or JS files.
- **Obfuscated JavaScript** — `script.js` is heavily obfuscated, making direct edits difficult. Custom logic should ideally be added in a separate JS file.
- **French language** — all UI text is in French. Maintain this convention for any new content.
- **Section IDs** — navigation uses anchor links (`#story`, `#reservation`, `#Galerie`). New sections should follow the same pattern.
- **Image paths** — images are organized in semantic subdirectories under `assets/images/` (e.g., `Angels/`, `couple/`, `blog/`).

## Notes

- The HTML contains HTTrack mirror comments (e.g., `<!-- Mirrored from wpocean.com/html/tf/love-love/... -->`), indicating this was originally downloaded from a template preview.
- The `package.json` dependencies (`@qwen-code/sdk`, `openai`) appear unrelated to the static site and may have been added for tooling purposes.
- The contact form (`#contact-form-main`) references `mail-contact.php` for form submission — this backend file is not present in the project and would need to be implemented for the form to work.
- The custom date picker widget uses a non-standard implementation (`styledate.css`). The Bootstrap Datepicker is also loaded via CDN but may not be wired up in the obfuscated JS.
