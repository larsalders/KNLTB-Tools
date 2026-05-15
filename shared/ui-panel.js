(function () {
  const panel = window.KNLTBPanel || {};

  function injectStyles(id, css) {
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function createButton(text, title, options = {}) {
    const button = document.createElement('button');
    button.type = options.type || 'button';
    button.textContent = text;
    if (title) button.title = title;
    button.style.cursor = 'pointer';
    button.style.border = '1px solid rgba(0,0,0,0.12)';
    button.style.borderRadius = '5px';
    button.style.padding = '4px 8px';
    button.style.background = options.background || '#fff';
    button.style.color = options.color || '#1f2937';
    button.style.fontWeight = '600';
    button.style.fontSize = '12px';
    if (options.minWidth) button.style.minWidth = options.minWidth;
    if (options.marginLeft) button.style.marginLeft = options.marginLeft;
    if (typeof options.width === 'string') button.style.width = options.width;
    return button;
  }

  function createPanel(options = {}) {
    const container = document.createElement('div');
    container.id = options.id || 'knltb-panel';
    container.className = options.className || 'knltb-panel';
    container.style.position = 'fixed';
    container.style.zIndex = options.zIndex || 9999;
    container.style.background = options.background || '#f8f9fb';
    container.style.border = '1px solid rgba(0,0,0,0.12)';
    container.style.borderRadius = '10px';
    container.style.boxShadow = '0 12px 30px rgba(0,0,0,0.12)';
    container.style.padding = options.padding || '12px';
    container.style.maxWidth = options.maxWidth || '95vw';
    container.style.maxHeight = options.maxHeight || 'calc(100vh - 40px)';
    container.style.overflow = 'auto';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';
    container.style.resize = options.resizable === false ? 'none' : 'both'; // Make resizable
    container.style.minWidth = options.minWidth || '340px';
    container.style.minHeight = options.minHeight || '160px';
    if (options.left) container.style.left = options.left;
    if (options.top) container.style.top = options.top;
    if (options.right) container.style.right = options.right;
    if (options.bottom) container.style.bottom = options.bottom;
    if (options.width) container.style.width = options.width;
    return container;
  }

  function createHeaderSection(titleText) {
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.gap = '8px';
    header.style.padding = '6px 0';
    header.style.borderBottom = '1px solid rgba(0,0,0,0.08)';
    header.style.cursor = 'grab';
    header.style.userSelect = 'none';

    const title = document.createElement('div');
    title.textContent = titleText || 'KNLTB Tools';
    title.style.fontWeight = '700';
    title.style.fontSize = '14px';
    title.style.lineHeight = '1.2';
    header.appendChild(title);

    const controlGroup = document.createElement('div');
    controlGroup.style.display = 'flex';
    controlGroup.style.alignItems = 'center';
    controlGroup.style.gap = '6px';
    header.appendChild(controlGroup);

    return { header, controlGroup, title };
  }

  function enableDragging(panel, handle) {
    let isDragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    const setGrabCursor = (grab) => {
      handle.style.cursor = grab ? 'grabbing' : 'grab';
    };

    const startDrag = (clientX, clientY) => {
      isDragging = true;
      const rect = panel.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      panel.style.left = `${startLeft}px`;
      panel.style.top = `${startTop}px`;
      panel.style.right = '';
      panel.style.bottom = '';
      startX = clientX;
      startY = clientY;
      document.body.style.userSelect = 'none';
      setGrabCursor(true);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp, { once: true });
    };

    const onMouseDown = (e) => {
      if (["input", "select", "textarea", "button", "a", "label"].includes(e.target.tagName.toLowerCase())) return;
      startDrag(e.clientX, e.clientY);
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let newLeft = startLeft + dx;
      let newTop = startTop + dy;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rect = panel.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const margin = 8;
      newLeft = Math.max(margin, Math.min(vw - w - margin, newLeft));
      newTop = Math.max(margin, Math.min(vh - h - margin, newTop));
      panel.style.left = `${newLeft}px`;
      panel.style.top = `${newTop}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
      window.removeEventListener('mousemove', onMouseMove);
      document.body.style.userSelect = '';
      setGrabCursor(false);
    };

    handle.addEventListener('mousedown', onMouseDown);
  }

  function addControlButtons(controlGroup, panel, options = {}) {
    const minimizeBtn = createButton('–', 'Minimize to dock');
    minimizeBtn.style.minWidth = '30px';
    minimizeBtn.style.height = '28px';
    minimizeBtn.style.display = 'inline-flex';
    minimizeBtn.style.alignItems = 'center';
    minimizeBtn.style.justifyContent = 'center';
    minimizeBtn.style.fontSize = '16px';
    minimizeBtn.style.lineHeight = '1';

    const maximizeBtn = createButton('⤢', 'Maximize/Restore');
    maximizeBtn.style.minWidth = '30px';
    maximizeBtn.style.height = '28px';
    maximizeBtn.style.display = 'inline-flex';
    maximizeBtn.style.alignItems = 'center';
    maximizeBtn.style.justifyContent = 'center';
    maximizeBtn.style.fontSize = '16px';
    maximizeBtn.style.lineHeight = '1';

    const collapseBtn = createButton('▾', 'Collapse/Expand');
    collapseBtn.style.minWidth = '30px';
    collapseBtn.style.height = '28px';
    collapseBtn.style.display = 'inline-flex';
    collapseBtn.style.alignItems = 'center';
    collapseBtn.style.justifyContent = 'center';
    collapseBtn.style.fontSize = '16px';
    collapseBtn.style.lineHeight = '1';

    // Order: collapse, maximize, minimize
    controlGroup.appendChild(collapseBtn);
    controlGroup.appendChild(maximizeBtn);
    controlGroup.appendChild(minimizeBtn);

    let isCollapsed = false;
    let isMaximized = false;
    let prevStyles = {};

    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isCollapsed = !isCollapsed;
      const contentWrap = panel.querySelector('.panel-content');
      if (contentWrap) {
        if (isCollapsed) {
          contentWrap.style.display = 'none';
          collapseBtn.textContent = '▸';
        } else {
          contentWrap.style.display = 'flex';
          collapseBtn.textContent = '▾';
        }
      }
    });

    maximizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isMaximized = !isMaximized;
      if (isMaximized) {
        prevStyles.left = panel.style.left;
        prevStyles.top = panel.style.top;
        prevStyles.width = panel.style.width;
        prevStyles.height = panel.style.height;
        prevStyles.resize = panel.style.resize;
        panel.style.left = '0px';
        panel.style.top = '0px';
        panel.style.width = window.innerWidth + 'px';
        panel.style.height = window.innerHeight + 'px';
        panel.style.resize = 'none';
        maximizeBtn.textContent = '⤡';
      } else {
        panel.style.left = prevStyles.left;
        panel.style.top = prevStyles.top;
        panel.style.width = prevStyles.width;
        panel.style.height = prevStyles.height;
        panel.style.resize = prevStyles.resize || 'both';
        maximizeBtn.textContent = '⤢';
      }
    });

    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Create dock button
      let dockBtn = document.getElementById('knltb-dock-btn');
      if (!dockBtn) {
        dockBtn = document.createElement('button');
        dockBtn.id = 'knltb-dock-btn';
        dockBtn.textContent = 'KNLTB Tools';
        dockBtn.title = 'Restore KNLTB Tools';
        dockBtn.style.position = 'fixed';
        dockBtn.style.bottom = '20px';
        dockBtn.style.left = '20px';
        dockBtn.style.zIndex = 10000;
        dockBtn.style.width = '120px';
        dockBtn.style.height = '32px';
        dockBtn.style.borderRadius = '6px';
        dockBtn.style.background = '#fff';
        dockBtn.style.border = '1px solid #ccc';
        dockBtn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
        dockBtn.style.fontSize = '12px';
        dockBtn.style.cursor = 'pointer';
        document.body.appendChild(dockBtn);
      }
      panel.style.display = 'none';
      dockBtn.onclick = () => {
        panel.style.display = 'flex';
        dockBtn.remove();
      };
    });
  }

  function createStandardPanel(titleText, options = {}) {
    const panel = createPanel(options);
    const { header, controlGroup } = createHeaderSection(titleText);
    panel.appendChild(header);
    addControlButtons(controlGroup, panel, options);
    enableDragging(panel, header);

    const contentWrap = document.createElement('div');
    contentWrap.className = 'panel-content';
    contentWrap.style.display = 'flex';
    contentWrap.style.flexDirection = 'column';
    contentWrap.style.flex = '1 1 auto';
    contentWrap.style.minHeight = '0';
    contentWrap.style.width = '100%';
    panel.appendChild(contentWrap);

    return { panel, contentWrap };
  }

  window.KNLTBPanel = Object.assign(panel, {
    injectStyles,
    createButton,
    createPanel,
    createHeaderSection,
    enableDragging,
    addControlButtons,
    createStandardPanel
  });
})();
