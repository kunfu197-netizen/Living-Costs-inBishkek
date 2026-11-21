const themeToggle = document.getElementById('themeToggle');
    const savedTheme = localStorage.getItem('bishkek-theme');
    const setTheme = isLight => {
        document.body.classList.toggle('light-theme', isLight);
        themeToggle.setAttribute('aria-pressed', String(isLight));
        themeToggle.setAttribute('aria-label', isLight ? 'Караңгы темага өтүү' : 'Жарык темага өтүү');
        themeToggle.querySelector('i').className = isLight ? 'fas fa-moon' : 'fas fa-sun';
        themeToggle.querySelector('span').textContent = isLight ? 'Караңгы режим' : 'Жарык режим';
    };

    setTheme(savedTheme === 'light');
    themeToggle.addEventListener('click', () => {
        const isLight = !document.body.classList.contains('light-theme');
        setTheme(isLight);
        localStorage.setItem('bishkek-theme', isLight ? 'light' : 'dark');
    });

    // Cursor glow and sparkle trail
    const glow = document.getElementById('cursorGlow');
    const canShowCursorTrail = window.matchMedia('(hover: hover) and (pointer: fine)').matches
        && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const starSymbols = ['✦', '✧', '✶', '✦'];
    let lastStarX = 0;
    let lastStarY = 0;
    let lastStarAt = 0;

    document.addEventListener('pointermove', event => {
        glow.style.left = event.clientX + 'px';
        glow.style.top = event.clientY + 'px';

        if (!canShowCursorTrail) return;
        const now = performance.now();
        const distance = Math.hypot(event.clientX - lastStarX, event.clientY - lastStarY);
        if (distance < 12 || now - lastStarAt < 28) return;

        lastStarX = event.clientX;
        lastStarY = event.clientY;
        lastStarAt = now;

        const star = document.createElement('span');
        star.className = 'cursor-star';
        star.textContent = starSymbols[Math.floor(Math.random() * starSymbols.length)];
        star.style.left = event.clientX + 'px';
        star.style.top = event.clientY + 'px';
        star.style.fontSize = (8 + Math.random() * 9) + 'px';
        star.style.color = Math.random() > 0.5 ? '#00c3ff' : '#ffffff';
        star.style.setProperty('--drift-x', (Math.random() * 30 - 15) + 'px');
        star.style.setProperty('--spin', (Math.random() * 120 - 60) + 'deg');
        document.body.appendChild(star);
        window.setTimeout(() => star.remove(), 750);
    }, { passive: true });

    // Nav scroll
    const nav = document.getElementById('mainNav');
    window.addEventListener('scroll', () => {
        nav.classList.toggle('scrolled', window.scrollY > 60);
    });

    // Intersection Observer for animations
    const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');

                // Animate price bars
                const fill = entry.target.querySelector('.price-bar-fill');
                if (fill) {
                    const w = fill.dataset.width;
                    setTimeout(() => { fill.style.width = w + '%'; }, 200);
                }

                io.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    document.querySelectorAll(
        '.anim, .stat-item, .feature-card, .price-card, .cta-inner, .section-tag, .section-h2, .section-sub'
    ).forEach(el => io.observe(el));

    // Left/right anims
    const ioLR = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                ioLR.unobserve(entry.target);
            }
        });
    }, { threshold: 0.2 });

    document.querySelectorAll('.anim-left, .anim-right').forEach(el => ioLR.observe(el));

    // Stagger delays for cards
    document.querySelectorAll('.stat-item').forEach((el, i) => {
        el.style.transitionDelay = (i * 0.1) + 's';
    });
