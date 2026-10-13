/*
Author: Huy Tran
Email: hqt.msg@gmail.com
Created: 2026-10-13
*/
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function mountJourney({ container, phases, weeks, onSelect, onArrive, onError }) {
  if (!container || !phases?.length || !Array.isArray(weeks)) throw new TypeError('Journey requires a container, phases and weeks');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  } catch (error) {
    onError?.(error);
    throw error;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.className = 'journey-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const labels = document.createElement('div');
  labels.className = 'journey-pins';
  labels.style.display = 'none';
  const nameplate = document.createElement('div');
  nameplate.className = 'journey-name';
  nameplate.hidden = true;
  container.append(canvas, labels, nameplate);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e7f2f4');
  const camera = new THREE.OrthographicCamera(-12, 12, 8, -8, .1, 100);
  camera.position.set(0, 18, 22);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  scene.add(new THREE.HemisphereLight('#fff9e9', '#a0b6b2', 2.6));
  const sun = new THREE.DirectionalLight('#fff2dc', 3);
  sun.position.set(-8, 18, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: .5, far: 60 });
  sun.shadow.normalBias = .04;
  sun.shadow.bias = -.0002;
  sun.shadow.radius = 4;
  scene.add(sun);

  const materials = new Map();
  const geometries = new Map();
  const terrainGeometry = new Set();
  const textures = new Set();
  const ambient = [];
  let ambientTime = 0;
  const pale = new THREE.Color('#b9c9ca');
  function material(color, locked = false) {
    const key = `${color}:${locked}`;
    if (!materials.has(key)) {
      const tint = new THREE.Color(color);
      if (locked) tint.lerp(pale, .88);
      materials.set(key, new THREE.MeshStandardMaterial({ color: tint, roughness: .88, metalness: 0 }));
    }
    return materials.get(key);
  }
  function geometry(key, create) {
    if (!geometries.has(key)) geometries.set(key, create());
    return geometries.get(key);
  }
  function mesh(parent, shape, color, position = [0, 0, 0], locked = false) {
    const object = new THREE.Mesh(shape, material(color, locked));
    object.position.set(...position);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(parent, size, color, position, locked = false, radius = .08) {
    const key = `box:${size.join(',')}:${radius}`;
    return mesh(parent, geometry(key, () => new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map(value => value / 3)))), color, position, locked);
  }
  function cylinder(parent, top, bottom, height, color, position, locked = false, sides = 16) {
    const key = `cylinder:${top}:${bottom}:${height}:${sides}`;
    return mesh(parent, geometry(key, () => new THREE.CylinderGeometry(top, bottom, height, sides)), color, position, locked);
  }
  function sphere(parent, radius, color, position, scale = [1, 1, 1], locked = false) {
    const object = mesh(parent, geometry('sphere', () => new THREE.SphereGeometry(1, 16, 12)), color, position, locked);
    object.scale.set(...scale.map(value => value * radius));
    return object;
  }
  function group(parent, position = [0, 0, 0]) {
    const object = new THREE.Group();
    object.position.set(...position);
    parent.add(object);
    return object;
  }
  function tree(parent, position, size = 1, locked = false) {
    const plant = group(parent, position);
    plant.scale.setScalar(size);
    cylinder(plant, .085, .12, .9, '#bd9473', [0, .45, 0], locked);
    const crown = group(plant, [0, .85, 0]);
    sphere(crown, .55, '#79b792', [0, .27, 0], [1, 1.25, .85], locked);
    if (!locked) {
      sphere(crown, .34, '#9acb9a', [-.3, .15, .16], [1, 1, 1]);
      ambient.push({ object: crown, kind: 'sway', offset: position[0] });
    }
  }
  function flower(parent, position, color, size = 1) {
    const plant = group(parent, position);
    plant.scale.setScalar(size);
    cylinder(plant, .025, .035, .34, '#6caa85', [0, .17, 0]);
    for (let petal = 0; petal < 5; petal++) {
      const angle = petal * Math.PI * 2 / 5;
      sphere(plant, .11, color, [Math.cos(angle) * .12, .38, Math.sin(angle) * .12], [1, .5, 1]);
    }
    sphere(plant, .075, '#efd073', [0, .42, 0], [1, .6, 1]);
    ambient.push({ object: plant, kind: 'sway', offset: position[0] + position[2] });
  }
  function flag(parent, position, color) {
    const hinge = group(parent, position);
    box(hinge, [.32, .2, .035], color, [.16, 0, 0]);
    ambient.push({ object: hinge, kind: 'flag', offset: position[0] });
  }
  function windmill(parent, position) {
    const mill = group(parent, position);
    cylinder(mill, .33, .52, 1.6, '#eee1c2', [0, .8, 0]);
    cylinder(mill, 0, .56, .6, '#c87666', [0, 1.85, 0]);
    box(mill, [.24, .48, .08], '#688f88', [0, .24, .49]);
    const rotor = group(mill, [0, 1.52, .49]);
    for (let blade = 0; blade < 4; blade++) {
      const spoke = group(rotor);
      spoke.rotation.z = blade * Math.PI / 2;
      box(spoke, [.06, 1.02, .07], '#a58564', [0, .51, 0]);
      box(spoke, [.23, .65, .045], '#fff0cf', [.09, .7, .015]);
    }
    sphere(rotor, .12, '#a58564', [0, 0, .07]);
    ambient.push({ object: rotor, kind: 'rotor', offset: 0 });
  }
  function house(parent, position, color, locked = false, size = 1) {
    const building = group(parent, position);
    building.scale.setScalar(size);
    box(building, [1.15, 1, .95], color, [0, .5, 0], locked, .12);
    const roof = cylinder(building, 0, .95, .65, '#d8887f', [0, 1.28, 0], locked, 4);
    roof.rotation.y = Math.PI / 4;
    if (!locked) {
      box(building, [.26, .52, .08], '#579595', [.22, .26, .51]);
      box(building, [.29, .3, .08], '#fff3d4', [-.26, .64, .51]);
      box(building, [.06, .3, .09], '#b5c9bd', [-.26, .64, .52]);
    }
    return building;
  }
  function landmark(parent, theme, position, locked, variant) {
    const site = group(parent, position);
    if (locked) {
      if (theme === 4 || theme === 5 || theme === 7) house(site, [0, 0, 0], '#b8c7c7', true, .85);
      else if (theme === 3) box(site, [.8, .85, .8], '#bccbca', [0, .42, 0], true);
      else tree(site, [0, 0, 0], .8, true);
      return;
    }
    switch (theme) {
      case 0: {
        tree(site, [-.36, 0, -.25], .88);
        box(site, [1.1, .12, .34], '#f5ddb0', [.3, .34, .4]);
        [-.08, .68].forEach(offset => box(site, [.1, .32, .24], '#b99775', [offset, .16, .4]));
        flower(site, [-.72, 0, .52], '#ed9ba7');
        flower(site, [.8, 0, -.15], '#f2ce79');
        break;
      }
      case 1: {
        for (let stalk = 0; stalk < 4; stalk++) {
          const offset = -.6 + stalk * .4;
          const height = 1.25 + (stalk % 2) * .4;
          cylinder(site, .065, .085, height, '#77ac89', [offset, height / 2, (stalk % 2) * .25]);
          for (let joint = 1; joint < 4; joint++) cylinder(site, .09, .09, .045, '#bfd59c', [offset, joint * height / 4, (stalk % 2) * .25]);
          const leaf = sphere(site, .28, '#92bf96', [offset + .17, height - .2, .12], [1.35, .24, .5]);
          leaf.rotation.z = .5;
        }
        box(site, [1.5, .12, .2], '#cda77b', [0, .5, .48]);
        break;
      }
      case 2: {
        const water = sphere(site, 1, '#72b9c5', [0, .025, 0], [1.22, .045, .83]);
        water.castShadow = false;
        for (let ripple = 0; ripple < 3; ripple++) {
          const wave = mesh(site, geometry('water-ripple', () => new THREE.TorusGeometry(.2, .012, 4, 16, Math.PI * 1.4)), '#b9e1dc', [-.72 + ripple * .66, .079, ripple % 2 ? .58 : -.56]);
          wave.rotation.x = -Math.PI / 2;
          wave.castShadow = false;
          ambient.push({ object: wave, kind: 'water', offset: ripple * 2, origin: wave.position.x });
        }
        for (let plank = 0; plank < 7; plank++) {
          const offset = -.78 + plank * .26;
          box(site, [.25, .1, .7], '#e0ba8b', [offset, .2 + Math.cos(offset * 1.8) * .18, 0]);
        }
        [-.8, .8].forEach(offset => [-.4, .4].forEach(depth => cylinder(site, .05, .06, .65, '#b79272', [offset, .32, depth])));
        [-.4, .4].forEach(depth => box(site, [1.8, .08, .09], '#eed5ac', [0, .63, depth]));
        break;
      }
      case 3: {
        box(site, [1.9, .15, 1.3], '#d2dcc5', [0, .07, 0], false, .12);
        box(site, [.65, .65, .65], '#e7a398', [-.5, .48, .1]);
        cylinder(site, 0, .48, 1.1, '#e8c875', [.42, .7, -.25], false, 4);
        const ring = mesh(site, geometry('garden-ring', () => new THREE.TorusGeometry(.38, .09, 8, 24)), '#7ab8be', [.45, .52, .44]);
        ring.rotation.y = -.2;
        break;
      }
      case 4: {
        if (variant === 0) windmill(site, [0, 0, 0]);
        else {
          house(site, [-.36, 0, 0], variant % 2 ? '#f3dbaa' : '#d1dfd7', false, .9);
          if (variant % 2) house(site, [.64, 0, -.26], '#aad1c0', false, .65);
          else tree(site, [.8, 0, -.3], .65);
        }
        box(site, [1.9, .08, .33], '#d3d9d0', [0, .04, .78]);
        break;
      }
      case 5: {
        box(site, [1.55, .62, .85], '#ecc393', [0, .31, 0]);
        [-.67, .67].forEach(offset => cylinder(site, .045, .06, 1.35, '#b5967b', [offset, .68, -.25]));
        for (let stripe = 0; stripe < 6; stripe++) box(site, [.27, .16, 1.1], stripe % 2 ? '#fff1d8' : '#8ebebe', [-.675 + stripe * .27, 1.4, 0]);
        for (let crate = 0; crate < 3; crate++) {
          box(site, [.4, .12, .42], '#bf9675', [-.5 + crate * .5, .67, .08]);
          cylinder(site, .13, .13, .065, '#efd176', [-.5 + crate * .5, .78, .08]);
        }
        break;
      }
      case 6: {
        box(site, [1.9, .18, 1.2], '#b6cd9a', [0, .09, 0], false, .15);
        for (let bloom = 0; bloom < 9; bloom++) flower(site, [-.65 + (bloom % 3) * .65, .18, -.4 + Math.floor(bloom / 3) * .4], ['#e998a8', '#f2cf79', '#c2acd0'][(bloom + variant) % 3], .8);
        break;
      }
      case 7: {
        box(site, [1.35, 1, .8], '#f0d8bd', [0, .5, 0], false, .12);
        [-.7, .7].forEach(offset => {
          cylinder(site, .29, .34, 1.5, '#e5c9b2', [offset, .75, 0]);
          cylinder(site, 0, .4, .6, '#96bcc7', [offset, 1.8, 0]);
          cylinder(site, .025, .025, .45, '#ab987e', [offset, 2.16, 0]);
          flag(site, [offset, 2.26, 0], '#e7ae87');
        });
        box(site, [.42, .65, .09], '#90b6b1', [0, .32, .44], false, .14);
        for (let merlon = 0; merlon < 4; merlon++) box(site, [.19, .2, .85], '#f0d8bd', [-.48 + merlon * .32, 1.1, 0]);
        break;
      }
    }
  }

  const explorer = group(scene);
  const body = group(explorer, [0, .57, 0]);
  box(body, [.43, .52, .29], '#e8b55f', [0, .35, 0], false, .1);
  box(body, [.34, .37, .2], '#76aaa4', [0, .34, -.22]);
  box(body, [.23, .14, .055], '#b9d0b1', [0, .24, -.34]);
  [-.14, .14].forEach(offset => box(body, [.045, .42, .04], '#658f8b', [offset, .35, .16]));
  sphere(body, .245, '#efc6a7', [0, .83, .015], [1, 1.08, .96]);
  sphere(body, .255, '#79aeb4', [0, .99, -.015], [1, .5, 1]);
  box(body, [.38, .055, .24], '#548e9a', [0, .99, .19]);
  [-.085, .085].forEach(offset => sphere(body, .025, '#435d60', [offset, .85, .234], [1, 1.15, .6]));
  sphere(body, .048, '#e5ad92', [0, .78, .25], [1, .7, .65]);
  const legs = [], arms = [];
  [-1, 1].forEach(side => {
    const leg = group(explorer, [side * .13, .59, 0]);
    box(leg, [.17, .43, .18], '#618b9b', [0, -.2, 0]);
    box(leg, [.21, .14, .31], '#f3e5ca', [0, -.49, .055]);
    legs.push(leg);
    const arm = group(body, [side * .29, .52, 0]);
    box(arm, [.14, .31, .16], '#e8b55f', [0, -.14, 0]);
    sphere(arm, .082, '#efc6a7', [0, -.34, 0]);
    arms.push(arm);
  });
  explorer.visible = false;

  let terrain = null, route = null, stations = [], entrance = 0;
  let state = null, pending = null, avatarWeek = null;
  let roam = null, revision = 0;
  const seen = new Map();
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let requestedMotion = true, motion = !media.matches;
  let disposed = false, lost = false, frame = null, lastDraw = null, lastStep = null, dirty = true;
  let frames = 0, width = 0, height = 0, mobile = false, phase = 0, terrainKey = '';
  const initialBounds = container.getBoundingClientRect();
  let visible = initialBounds.bottom > 0 && initialBounds.top < window.innerHeight && initialBounds.right > 0 && initialBounds.left < window.innerWidth;
  const projected = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const viewPoint = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const roadPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.38);
  const pointer = new THREE.Vector2();
  const hitPoint = new THREE.Vector3();
  const samplePoint = new THREE.Vector3();
  const blockedSelector = '#gModal.open,#gardenOv.open,#dashOv.open,#pcOverlay.open,#introOverlay.open';
  function active() {
    return !disposed && !lost && visible && width > 0 && height > 0 && !document.hidden &&
      document.body.classList.contains('mode-game') && !document.body.classList.contains('locked') && !document.querySelector(blockedSelector);
  }
  function phaseFor(week) {
    return phases.findIndex(region => week >= region.from && week <= region.to);
  }
  function travelingHere() {
    return pending && pending.owner === state?.owner && phaseFor(pending.to) === phase;
  }
  function removeTerrain() {
    if (terrain) {
      terrain.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
      scene.remove(terrain);
    }
    ambient.length = 0;
    terrainGeometry.forEach(shape => shape.dispose());
    terrainGeometry.clear();
    labels.replaceChildren();
    stations = [];
  }
  function buildTerrain() {
    removeTerrain();
    terrain = group(scene);
    const region = phases[phase];
    const count = region.to - region.from + 1;
    const unlocked = state?.unlocked ?? 0;
    const lockedRegion = region.from > unlocked;
    const palette = ['#91c778', '#77b68b', '#8ac4aa', '#a6c77d', '#8bb69e', '#b5c48c', '#afd080', '#98b8b0'];
    const landWidth = mobile ? 8.2 : 21.6;
    const landDepth = mobile ? 19.5 : 11.5;
    const halfWidth=landWidth/2,halfDepth=landDepth/2,outline=new THREE.Shape();
    outline.moveTo(-halfWidth*.8,-halfDepth);
    outline.bezierCurveTo(-halfWidth*.2,-halfDepth*1.08,halfWidth*.3,-halfDepth*.75,halfWidth*.8,-halfDepth);
    outline.bezierCurveTo(halfWidth*1.13,-halfDepth*.9,halfWidth*.88,-halfDepth*.2,halfWidth,halfDepth*.12);
    outline.bezierCurveTo(halfWidth*1.1,halfDepth*.7,halfWidth*.8,halfDepth*1.06,halfWidth*.42,halfDepth);
    outline.bezierCurveTo(0,halfDepth*.88,-halfWidth*.55,halfDepth*1.15,-halfWidth*.92,halfDepth*.83);
    outline.bezierCurveTo(-halfWidth*1.13,halfDepth*.4,-halfWidth*.86,0,-halfWidth,-halfDepth*.35);
    outline.bezierCurveTo(-halfWidth*1.05,-halfDepth*.8,-halfWidth,-halfDepth*.94,-halfWidth*.8,-halfDepth);
    for(const [depth,color,level] of [[.55,'#c3a87f',-.55],[.18,palette[phase%8],0]]){
      const land=new THREE.ExtrudeGeometry(outline,{depth,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.14,bevelThickness:.1,curveSegments:16});
      land.rotateX(-Math.PI/2);terrainGeometry.add(land);mesh(terrain,land,color,[0,level,0],lockedRegion);
    }
    const positions = Array.from({ length: count }, (_, index) => new THREE.Vector3(
      mobile ? (index % 2 ? 2.2 : -2.2) : -8.2 + index * 16.4 / Math.max(1, count - 1),
      .38,
      mobile ? -7.2 + index * 14.4 / Math.max(1, count - 1) : (index % 2 ? 2.5 : -1.9)
    ));
    const first = positions[0], final = positions[count - 1];
    const start = first.clone().add(new THREE.Vector3(mobile ? -.65 : -1.4, 0, mobile ? -1.35 : 1.1));
    const finish = final.clone().add(new THREE.Vector3(mobile ? .65 : 1.4, 0, mobile ? 1.35 : -.8));
    route = new THREE.CatmullRomCurve3([start, ...positions, finish], false, 'centripetal');
    route.arcLengthDivisions = 400;
    const distances = route.getLengths();
    const total = distances[distances.length - 1];
    function distanceAt(parameter) {
      const scaled = parameter * route.arcLengthDivisions;
      const lower = Math.floor(scaled), upper = Math.min(distances.length - 1, lower + 1);
      return THREE.MathUtils.lerp(distances[lower], distances[upper], scaled - lower) / total;
    }
    entrance = 0;
    const road = new THREE.TubeGeometry(route, mobile ? 120 : 100, .38, 8, false);
    const roadPositions = road.attributes.position;
    for (let vertex = 0; vertex < roadPositions.count; vertex++) roadPositions.setY(vertex, .38 + (roadPositions.getY(vertex) - .38) * .12);
    road.computeVertexNormals();
    terrainGeometry.add(road);
    mesh(terrain, road, '#dfcdab', [0, 0, 0], lockedRegion);
    positions.forEach((position, index) => {
      const week = region.from + index;
      const locked = week > unlocked;
      const stars = Math.max(0, Math.min(3, Number(state?.stars?.[week]) || 0));
      const complete = stars > 0 || week < unlocked;
      if (locked) {
        const fog = cylinder(terrain, 1, 1, .035, '#cbd9d6', [mobile ? 0 : position.x, .18, position.z]);
        fog.scale.set(mobile ? 3.85 : 1.95, 1, mobile ? 1.8 : 2.5);
      }
      cylinder(terrain, .65, .77, .26, locked ? '#bdccce' : complete ? '#81b69c' : '#e6bc73', [position.x, .37, position.z]);
      cylinder(terrain, .6, .65, .12, locked ? '#d6dfde' : '#fff0cc', [position.x, .56, position.z]);
      if (!locked) {
        cylinder(terrain, .028, .035, .85, '#a38c71', [position.x - .72, .59, position.z - .25]);
        flag(terrain, [position.x - .72, .91, position.z - .25], complete ? '#81b4a3' : '#eab675');
      }
      const landmarkPosition = mobile ? [position.x > 0 ? -1.55 : 1.55, .17, position.z - .25] : [position.x, .17, position.z - 1.85];
      landmark(terrain, phase % 8, landmarkPosition, locked, index);
      if (!locked && phase !== 6) {
        flower(terrain, [position.x + .95, .17, position.z + .48], index % 2 ? '#e9b28f' : '#edafba', .75);
      }
      if (locked) {
        const veil = cylinder(terrain, 1.25, 1.4, .04, '#d5dfdf', [landmarkPosition[0], .19, landmarkPosition[2]]);
        veil.scale.z = .65;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'journey-pin';
      button.dataset.week = String(week);
      button.style.minWidth = '40px';
      button.style.minHeight = '40px';
      button.textContent = String(week);
      const rating = document.createElement('small');
      rating.textContent = `${stars}/3`;
      button.appendChild(rating);
      button.title = weeks.find(entry => entry.w === week)?.title || `${region.name}: ${week}`;
      button.setAttribute('aria-label', `${button.title}, ${stars}/3`);
      button.disabled = locked;
      if (week === unlocked) button.setAttribute('aria-current', 'step');
      labels.appendChild(button);
      stations.push({ week, position, button, distance: distanceAt((index + 1) / (count + 1)) });
    });
    addGroundDetails(landWidth, landDepth, lockedRegion);
    terrain.updateMatrixWorld(true);
    fitCamera();
  }
  function addGroundDetails(landWidth, landDepth, locked) {
    const stamp = new THREE.Object3D();
    const ground = new THREE.InstancedMesh(geometry('ground-patch', () => new THREE.CircleGeometry(1, 7)), material('#85ac70', locked), 48);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = .285;
    let accepted = 0;
    for (let patch = 0; patch < 80 && accepted < 48; patch++) {
      const horizontal = (Math.sin(patch * 12.9898 + 1) * 43758.5453 % 1) * landWidth * .4;
      const depth = (Math.sin(patch * 7.233 + 5) * 19413.171 % 1) * landDepth * .38;
      if (stations.some(station => Math.hypot(horizontal - station.position.x, depth - station.position.z) < 1.15)) continue;
      stamp.position.set(horizontal, -depth, 0);
      stamp.rotation.set(0, 0, patch * 2.4);
      stamp.scale.set(.22 + (patch % 4) * .13, .13 + (patch % 3) * .1, 1);
      stamp.updateMatrix();
      ground.setMatrixAt(accepted, stamp.matrix);
      ground.setColorAt(accepted++, new THREE.Color(patch % 2 ? '#b1c897' : '#83ab73'));
    }
    ground.count = accepted;
    terrain.add(ground);
    const gravel = new THREE.InstancedMesh(geometry('route-gravel', () => new THREE.IcosahedronGeometry(1, 0)), material('#e9dfc8', locked), 90);
    for (let stone = 0; stone < 90; stone++) {
      route.getPointAt((stone + .5) / 90, samplePoint);
      route.getTangentAt((stone + .5) / 90, tangent);
      const offset = Math.sin(stone * 2.4) * .28;
      stamp.position.set(samplePoint.x + tangent.z * offset, .428, samplePoint.z - tangent.x * offset);
      stamp.rotation.set(0, stone * 1.7, 0);
      stamp.scale.set(.025 + (stone % 3) * .009, .014, .025);
      stamp.updateMatrix();
      gravel.setMatrixAt(stone, stamp.matrix);
    }
    terrain.add(gravel);
    const grass = new THREE.InstancedMesh(geometry('grass-blade', () => new THREE.ConeGeometry(.055, .27, 3)), material('#608e58', locked), 54);
    for (let blade = 0; blade < 54; blade++) {
      route.getPointAt((blade + .5) / 54, samplePoint);
      route.getTangentAt((blade + .5) / 54, tangent);
      const offset = (blade % 2 ? 1 : -1) * (.55 + (blade % 3) * .13);
      stamp.position.set(samplePoint.x + tangent.z * offset, .39, samplePoint.z - tangent.x * offset);
      stamp.rotation.set(.15, blade * 2.4, .18 * Math.sin(blade));
      stamp.scale.setScalar(.6 + (blade % 4) * .15);
      stamp.updateMatrix();
      grass.setMatrixAt(blade, stamp.matrix);
    }
    terrain.add(grass);
  }
  function fitCamera() {
    if (!width || !height || !terrain) return;
    const bounds = new THREE.Box3().setFromObject(terrain);
    bounds.max.y = Math.max(bounds.max.y, 3.5);
    let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
    camera.position.set(0, 18, 22);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    for (const horizontal of [bounds.min.x, bounds.max.x]) {
      for (const vertical of [bounds.min.y, bounds.max.y]) {
        for (const depth of [bounds.min.z, bounds.max.z]) {
          viewPoint.set(horizontal, vertical, depth).applyMatrix4(camera.matrixWorldInverse);
          left = Math.min(left, viewPoint.x); right = Math.max(right, viewPoint.x);
          bottom = Math.min(bottom, viewPoint.y); top = Math.max(top, viewPoint.y);
        }
      }
    }
    const horizontalPadding = Math.min(mobile ? 34 : 70, width * .2);
    const verticalPadding = Math.min(58, height * .16);
    const aspect = width / height;
    const span = Math.max((top - bottom) / (1 - 2 * verticalPadding / height), (right - left) / (1 - 2 * horizontalPadding / width) / aspect);
    const centerX = (left + right) / 2, centerY = (bottom + top) / 2;
    camera.left = centerX - span * aspect / 2; camera.right = centerX + span * aspect / 2;
    camera.bottom = centerY - span / 2; camera.top = centerY + span / 2;
    camera.updateProjectionMatrix();
  }
  function resetPose() {
    legs.forEach(leg => { leg.rotation.x = 0; });
    arms.forEach(arm => { arm.rotation.x = 0; });
    body.position.y = .57;
    body.rotation.z = 0;
  }
  function stridePose(elapsed) {
    const stride = Math.sin(elapsed * Math.PI * 8);
    legs[0].rotation.x = stride * .55; legs[1].rotation.x = -stride * .55;
    arms[0].rotation.x = -stride * .35; arms[1].rotation.x = stride * .35;
    body.position.y += Math.abs(stride) * .045;
    body.rotation.z = stride * .035;
  }
  function placeAvatar() {
    resetPose();
    if (!state || !route) { explorer.visible = false; return; }
    if (travelingHere()) {
      const destination = stations.find(station => station.week === pending.to);
      const source = stations.find(station => station.week === pending.from);
      const progress = pending.elapsed / 1.6;
      const eased = progress * progress * (3 - 2 * progress);
      route.getPointAt(THREE.MathUtils.lerp(source?.distance ?? entrance, destination.distance, eased), explorer.position);
      route.getTangentAt(THREE.MathUtils.lerp(source?.distance ?? entrance, destination.distance, eased), tangent);
      explorer.rotation.y = Math.atan2(tangent.x, tangent.z);
      if (motion && pending.elapsed > 0) {
        stridePose(pending.elapsed);
      }
      explorer.visible = true;
    } else if (roam && !pending) {
      route.getPointAt(roam.distance, explorer.position);
      route.getTangentAt(roam.distance, tangent);
      explorer.rotation.y = Math.atan2(tangent.x, tangent.z) + (roam.target < roam.from ? Math.PI : 0);
      if (motion && !roam.complete) stridePose(roam.elapsed);
      explorer.visible = true;
    } else {
      const station = stations.find(entry => entry.week === avatarWeek);
      explorer.visible = !pending && !!station;
      if (station) explorer.position.copy(station.position);
      explorer.rotation.y = .18;
    }
    explorer.position.y += .24;
  }
  function lastUnlockedStation() {
    return stations.filter(station => station.week <= state?.unlocked).at(-1);
  }
  function startRoam(distance, week = null) {
    const limit = lastUnlockedStation();
    if (!active() || !state || !route || pending || !limit || !Number.isFinite(distance) || distance < entrance || distance > limit.distance) return false;
    const source = stations.find(station => station.week === avatarWeek) || limit;
    const from = roam?.distance ?? source.distance;
    roam = { from, distance: from, target: distance, targetWeek: week, elapsed: 0,
      duration: Math.max(.2, Math.abs(distance - from) * route.getLength() / 2.4), complete: false };
    lastStep = null;
    placeAvatar();
    sync();
    return true;
  }
  function walkTo(week) {
    const station = stations.find(entry => entry.week === week);
    return !!station && startRoam(station.distance, week);
  }
  function home() {
    if (disposed || lost) return;
    roam = null;
    cancelPress();
    avatarWeek = pending ? pending.from : state?.unlocked;
    placeAvatar();
    sync();
  }
  function roamAt(event) {
    if (!active() || pending || !route) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2);
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(roadPlane, hitPoint)) return;
    let nearest = 0, nearestSquared = Infinity;
    const samples = 480;
    for (let sample = 0; sample <= samples; sample++) {
      route.getPointAt(sample / samples, samplePoint);
      const squared = samplePoint.distanceToSquared(hitPoint);
      if (squared < nearestSquared) { nearestSquared = squared; nearest = sample / samples; }
    }
    const lower = Math.max(0, nearest - 1 / samples), upper = Math.min(1, nearest + 1 / samples);
    for (let sample = 0; sample <= 24; sample++) {
      const distance = THREE.MathUtils.lerp(lower, upper, sample / 24);
      route.getPointAt(distance, samplePoint);
      const squared = samplePoint.distanceToSquared(hitPoint);
      if (squared < nearestSquared) { nearestSquared = squared; nearest = distance; }
    }
    if (nearestSquared <= .55 * .55) startRoam(nearest);
  }
  function animateAmbient(delta) {
    if (motion) ambientTime += delta;
    for (const item of ambient) {
      const wave = motion ? Math.sin(ambientTime * 1.4 + item.offset) : 0;
      if (item.kind === 'rotor') item.object.rotation.z = motion ? ambientTime * .45 : .35;
      else if (item.kind === 'water') {
        item.object.position.x = item.origin + wave * .12;
        item.object.scale.setScalar(1 + wave * .15);
      } else if (item.kind === 'flag') item.object.rotation.y = wave * .18;
      else item.object.rotation.z = wave * .045;
    }
  }
  function projectLabels() {
    stations.forEach(station => {
      projected.copy(station.position);
      projected.z += .92;
      projected.y = .55;
      projected.project(camera);
      station.button.style.left = `${(projected.x * .5 + .5) * width}px`;
      station.button.style.top = `${(-projected.y * .5 + .5) * height}px`;
    });
    nameplate.hidden = !explorer.visible || !state?.name;
    if (!nameplate.hidden) {
      projected.copy(explorer.position);
      projected.y += 1.95;
      projected.project(camera);
      const halfWidth = nameplate.offsetWidth / 2 + 4;
      nameplate.style.left = `${THREE.MathUtils.clamp((projected.x * .5 + .5) * width, halfWidth, Math.max(halfWidth, width - halfWidth))}px`;
      nameplate.style.top = `${THREE.MathUtils.clamp((-projected.y * .5 + .5) * height, nameplate.offsetHeight + 4, height - 4)}px`;
    }
  }
  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastStep = null;
  }
  function fail(error) {
    if (lost || disposed) return;
    lost = true;
    stop();
    pending = null;
    roam = null;
    cancelPress();
    container.classList.remove('journey-ready');
    labels.style.display = 'none';
    nameplate.hidden = true;
    onError?.(error);
  }
  function tick(time) {
    frame = null;
    if (!active()) { lastStep = null; return; }
    if (lastDraw !== null && time - lastDraw < 1000 / 30) { frame = requestAnimationFrame(tick); return; }
    const delta = lastStep === null ? 0 : Math.min((time - lastStep) / 1000, .065);
    lastDraw = time;
    lastStep = time;
    let arrival = null;
    if (travelingHere()) {
      pending.elapsed = motion ? Math.min(1.6, pending.elapsed + delta) : 1.6;
      if (pending.elapsed >= 1.6) {
        arrival = { id: pending.id, owner: pending.owner, revision };
        avatarWeek = pending.to;
        pending = null;
      }
    } else if (roam && !pending && !roam.complete) {
      roam.elapsed = motion ? Math.min(roam.duration, roam.elapsed + delta) : roam.duration;
      const progress = roam.elapsed / roam.duration;
      roam.distance = THREE.MathUtils.lerp(roam.from, roam.target, progress * progress * (3 - 2 * progress));
      roam.complete = progress >= 1;
    }
    placeAvatar();
    animateAmbient(delta);
    dirty = false;
    try {
      renderer.render(scene, camera);
      if (disposed || lost) return;
      frames++;
      labels.style.display = '';
      projectLabels();
      container.classList.add('journey-ready');
    } catch (error) { fail(error); return; }
    if (arrival && !disposed && !lost && arrival.owner === state?.owner && arrival.revision === revision) {
      try { onArrive?.(arrival.id); } catch (error) { fail(error); return; }
    }
    if (active() && (dirty || (motion && (travelingHere() || (roam && !roam.complete) || ambient.length)))) {
      if (frame === null) frame = requestAnimationFrame(tick);
    } else {
      lastStep = null;
    }
  }
  function sync() {
    if (disposed || lost) return;
    dirty = true;
    if (!active()) { cancelPress(); stop(); return; }
    if (frame === null) frame = requestAnimationFrame(tick);
  }
  function resize() {
    if (disposed || lost) return;
    const bounds = container.getBoundingClientRect();
    width = bounds.width; height = bounds.height;
    if (!width || !height) { stop(); return; }
    const nextMobile = width < 620;
    const rebuild = mobile !== nextMobile || !terrain;
    mobile = nextMobile;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height, false);
    if (rebuild) buildTerrain(); else fitCamera();
    sync();
  }
  function update(next) {
    if (disposed || lost) return;
    if (!next || !Number.isInteger(next.phase) || !phases[next.phase]) throw new TypeError('Journey state.phase must be a valid zero-based index');
    const ownerChanged = !state || state.owner !== next.owner;
    const contextChanged = ownerChanged || state.phase !== next.phase || state.unlocked !== next.unlocked;
    if (contextChanged) {
      revision++;
      roam = null;
      if (pending) seen.get(pending.owner)?.delete(pending.id);
      pending = null;
      cancelPress();
    }
    if (ownerChanged) {
      stop();
      pending = null;
      explorer.visible = false;
      nameplate.hidden = true;
    }
    state = { owner: next.owner, name: String(next.name ?? ''), unlocked: next.unlocked, stars: { ...next.stars }, phase: next.phase };
    phase = state.phase;
    nameplate.textContent = state.name;
    const travel = next.travel;
    if (pending && (!travel || travel.id !== pending.id || travel.owner !== pending.owner ||
      travel.from !== pending.from || travel.to !== pending.to)) {
      revision++;
      pending = null;
    }
    if (travel && travel.id != null && travel.owner === state.owner && Number.isInteger(travel.from) &&
      Number.isInteger(travel.to) && travel.to === travel.from + 1 && travel.to <= state.unlocked &&
      phaseFor(travel.from) >= 0 && phaseFor(travel.to) >= 0) {
      if (!seen.has(state.owner)) seen.set(state.owner, new Set());
      const ownerTrips = seen.get(state.owner);
      if (!ownerTrips.has(travel.id)) {
        if (phaseFor(travel.to) === phase) {
          ownerTrips.add(travel.id);
          revision++;
          roam = null;
          cancelPress();
          pending = { id: travel.id, owner: travel.owner, from: travel.from, to: travel.to, elapsed: 0 };
          lastStep = null;
        }
      }
    }
    avatarWeek = pending ? pending.from : state.unlocked;
    const region = phases[phase];
    const key = JSON.stringify([phase, state.unlocked, Array.from({ length: region.to - region.from + 1 }, (_, index) => state.stars[region.from + index] || 0)]);
    if (terrainKey !== key) { terrainKey = key; buildTerrain(); }
    placeAvatar();
    sync();
  }

  let press = null, release = null;
  function beginPress(event) {
    if (!active() || !event.isPrimary || event.button !== 0) { cancelPress(); return; }
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, target: event.target.closest?.('button[data-week]'), canvas: event.target === canvas, moved: false };
    release = null;
  }
  function movePress(event) {
    if (press && event.pointerId === press.id && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) press.moved = true;
  }
  function endPress(event) {
    if (!press || event.pointerId !== press.id) return;
    movePress(event);
    release = press;
    press = null;
    if (release.canvas && event.target === canvas && !release.moved) {
      release = null;
      roamAt(event);
    }
  }
  function cancelPress() { press = null; release = null; }
  function select(event) {
    const button = event.target.closest?.('button[data-week]');
    const pointerAllowed = release && release.target === button && !release.moved;
    release = null;
    if (!button || !labels.contains(button) || button.disabled || !active()) return;
    if (event.detail !== 0 && !pointerAllowed) return;
    const week = Number(button.dataset.week);
    if (week <= state?.unlocked) onSelect?.(week);
  }
  function contextLost(event) { event.preventDefault(); fail(new Error('Journey WebGL context lost')); }
  function motionChanged() { motion = requestedMotion && !media.matches; sync(); }
  canvas.addEventListener('webglcontextlost', contextLost);
  labels.addEventListener('click', select);
  container.addEventListener('pointerdown', beginPress);
  window.addEventListener('pointermove', movePress, { passive: true });
  window.addEventListener('pointerup', endPress);
  window.addEventListener('pointercancel', cancelPress);
  window.addEventListener('blur', cancelPress);
  const intersection = new IntersectionObserver(entries => {
    visible = entries[entries.length - 1].isIntersecting;
    sync();
  });
  intersection.observe(container);
  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(container);
  const blockers = new Set(['gModal', 'gardenOv', 'dashOv', 'pcOverlay', 'introOverlay']);
  const stateObserver = new MutationObserver(records => {
    if (records.some(record => record.type === 'attributes' ? record.target === document.body || blockers.has(record.target.id) :
      [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && (blockers.has(node.id) || node.querySelector?.('#gModal,#gardenOv,#dashOv,#pcOverlay,#introOverlay'))))) sync();
  });
  stateObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', sync);
  media.addEventListener('change', motionChanged);
  resize();
  return {
    update,
    home,
    walkTo,
    setMotion(value) { if (disposed || lost) return; requestedMotion = !!value; motionChanged(); },
    sync,
    stats() {
      return { frames, running: frame !== null, motion, walking: !!(motion && (travelingHere() || (roam && !roam.complete)) && active()),
        roaming: !!roam, walkTarget: roam ? { phase, week: roam.targetWeek, distance: roam.target } : null,
        walkDistance: roam?.distance ?? null,
        avatarWeek, position: explorer.visible ? explorer.position.toArray() : null,
        drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, phase, lost };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      pending = null;
      roam = null;
      cancelPress();
      intersection.disconnect(); sizeObserver.disconnect(); stateObserver.disconnect();
      document.removeEventListener('visibilitychange', sync);
      media.removeEventListener('change', motionChanged);
      canvas.removeEventListener('webglcontextlost', contextLost);
      labels.removeEventListener('click', select);
      container.removeEventListener('pointerdown', beginPress);
      window.removeEventListener('pointermove', movePress);
      window.removeEventListener('pointerup', endPress);
      window.removeEventListener('pointercancel', cancelPress);
      window.removeEventListener('blur', cancelPress);
      removeTerrain();
      geometries.forEach(shape => shape.dispose());
      materials.forEach(surface => surface.dispose());
      textures.forEach(texture => texture.dispose());
      sun.shadow.dispose();
      renderer.dispose();
      scene.clear(); geometries.clear(); materials.clear(); textures.clear(); seen.clear();
      canvas.remove(); labels.remove(); nameplate.remove();
      container.classList.remove('journey-ready');
    }
  };
}