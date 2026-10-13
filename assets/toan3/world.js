/*
Author: Huy Tran
Email: hqt.msg@gmail.com
Created: 2026-10-13
*/
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function mountWorld({ container, realms, onSelect, onError }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  renderer.domElement.className = 'toan3-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e7f2f4');
  const camera = new THREE.OrthographicCamera(-10, 10, 7, -7, .1, 100);
  camera.position.set(0, 13, 18);
  camera.lookAt(0, .4, 0);
  scene.add(new THREE.HemisphereLight('#fff9e9', '#8da6a7', 2.4));
  const sun = new THREE.DirectionalLight('#fff3dc', 3.2);
  sun.position.set(-7, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: .5, far: 40 });
  sun.shadow.normalBias = .035;
  sun.shadow.bias = -.0002;
  sun.shadow.radius = 4;
  scene.add(sun);

  const materials = new Map(), geometries = new Set(), textures = new Set();
  function material(color) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .82, metalness: 0 }));
    return materials.get(color);
  }
  function mesh(parent, geometry, color, position = [0, 0, 0]) {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, material(color));
    object.position.set(...position);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(parent, size, color, position, radius = .08) {
    return mesh(parent, new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map(value => value / 3))), color, position);
  }
  function ball(parent, radius, color, position, scale = [1, 1, 1]) {
    const object = mesh(parent, new THREE.SphereGeometry(radius, 20, 14), color, position);
    object.scale.set(...scale);
    return object;
  }
  function cylinder(parent, top, bottom, height, color, position) {
    return mesh(parent, new THREE.CylinderGeometry(top, bottom, height, 32), color, position);
  }
  function tree(parent, position, scale = 1, color = '#4a9f79') {
    const group = new THREE.Group();
    group.position.set(...position);group.scale.setScalar(scale);parent.add(group);
    cylinder(group, .08, .11, .7, '#b38160', [0, .6, 0]);
    ball(group, .44, color, [0, 1.14, 0], [.95, 1.25, 1]);
    ball(group, .28, color, [-.23, 1.0, .12]);
    ball(group, .3, color, [.25, 1.12, -.02]);
  }
  function plaque(parent, text, color, position, size = .7) {
    const canvas = document.createElement('canvas');canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    context.fillStyle = color;context.fillRect(0, 0, 128, 128);
    context.fillStyle = '#ffffff';context.font = 'bold 94px Trebuchet MS';context.textAlign = 'center';context.textBaseline = 'middle';context.fillText(text, 64, 69);
    const texture = new THREE.CanvasTexture(canvas);texture.colorSpace = THREE.SRGBColorSpace;textures.add(texture);
    const surface = new THREE.MeshStandardMaterial({ map: texture, roughness: .9 });materials.set(Symbol(), surface);
    const geometry = new THREE.PlaneGeometry(size, size);geometries.add(geometry);
    const label = new THREE.Mesh(geometry, surface);label.position.set(...position);parent.add(label);
  }
  function island(index) {
    const group = new THREE.Group();scene.add(group);
    const profile = [[0, -.45], [1.18, -.45], [1.48, -.3], [1.66, .08], [1.7, .26], [1.65, .36], [0, .36]].map(point => new THREE.Vector2(...point));
    mesh(group, new THREE.LatheGeometry(profile, 48), '#d2b790');
    cylinder(group, 1.64, 1.68, .19, ['#8aca93','#a2cc8d','#8dc5ac','#bdd095','#92c49a','#a0ccad'][index], [0, .39, 0]);
    for (let stone = 0; stone < 3; stone++) ball(group, .15, '#e5ddc7', [-.44 + stone * .4, .51, 1.03], [1.25, .28, .85]);
    tree(group, [-1.12, .46, -.48], .68);
    tree(group, [1.05, .46, -.68], .5, '#79b78c');
    return group;
  }
  const islands = realms.map((realm, index) => ({ group: island(index), realm, anchor: new THREE.Vector3(), hover: 0 }));
  const spinners = [];
  {
    const group = islands[0].group;
    [[-.58,.91,.2,'#edac4b','1'],[.34,.91,.2,'#5d9fc4','2'],[-.13,1.76,.15,'#e77a6a','3']].forEach(([x,y,z,color,text]) => {
      box(group, [.8,.8,.8], color, [x,y,z], .12);plaque(group,text,color,[x,y,z+.405],.56);
    });
    ball(group,.16,'#f5cb65',[.94,.7,.56]);
  }
  {
    const group = islands[1].group;
    box(group,[1.35,1.25,1.1],'#f2d89b',[0,1.1,0],.13);
    const roof=mesh(group,new THREE.ConeGeometry(1.12,.8,4),'#4f99a1',[0,2.05,0]);roof.rotation.y=Math.PI/4;
    box(group,[.36,.58,.12],'#377782',[.33,.8,.6]);
    box(group,[.34,.34,.12],'#fff5dc',[-.36,1.35,.59]);
    const rotor=new THREE.Group();rotor.position.set(0,1.96,.86);group.add(rotor);
    for(let blade=0;blade<4;blade++){const paddle=box(rotor,[.2,.76,.09],'#f3b866',[0,.38,0],.05);const pivot=new THREE.Group();pivot.rotation.z=blade*Math.PI/2;rotor.add(pivot);pivot.add(paddle);}
    ball(rotor,.15,'#d66a54',[0,0,.09]);spinners.push(rotor);
  }
  {
    const group = islands[2].group;
    cylinder(group,1.2,1.2,.04,'#64bfc9',[0,.5,0]);
    [-.76,.76].forEach(x=>{box(group,[.28,.65,1.3],'#faf0d8',[x,.79,0]);ball(group,.18,'#eda45c',[x,1.16,-.55]);ball(group,.18,'#eda45c',[x,1.16,.55]);});
    for(let board=0;board<9;board++){const x=-.9+board*.225;box(group,[.24,.14,1.1],'#e0a66d',[x,.9+.24*Math.cos(x*1.5),0],.04);}
    [-.59,.59].forEach(z=>{const points=Array.from({length:21},(_,index)=>{const x=-.95+index*.095;return new THREE.Vector3(x,1.26+.26*Math.cos(x*1.5),z);});mesh(group,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),20,.055,6,false),'#f2d29e');});
  }
  {
    const group = islands[3].group;
    cylinder(group,.2,.28,1.25,'#cba476',[0,1,0]);
    const clock=cylinder(group,.68,.68,.18,'#edb453',[0,1.8,.02]);clock.rotation.x=Math.PI/2;
    const face=cylinder(group,.58,.58,.19,'#fff7df',[0,1.8,.1]);face.rotation.x=Math.PI/2;
    for(let tick=0;tick<12;tick++){const angle=tick*Math.PI/6;const mark=box(group,[.035,.10,.035],'#59777c',[Math.sin(angle)*.47,1.8+Math.cos(angle)*.47,.22],.01);mark.rotation.z=-angle;}
    box(group,[.055,.39,.06],'#3b7284',[0,1.98,.24],.02);
    box(group,[.29,.065,.06],'#e47864',[.13,1.8,.26],.02);ball(group,.065,'#3b7284',[0,1.8,.28]);
    const ruler=box(group,[.36,1.42,.16],'#efca72',[-.9,1.11,.18]);ruler.rotation.z=-.2;
    for(let tick=0;tick<7;tick++)box(ruler,[tick%2?.12:.21,.022,.03],'#997643',[0,-.55+tick*.17,.09],.006);
  }
  {
    const group=islands[4].group;
    box(group,[.86,.86,.86],'#659fc5',[-.62,.93,.19],.1);
    ball(group,.5,'#f1bf53',[.49,1,.42]);
    const pyramid=mesh(group,new THREE.ConeGeometry(.65,1.1,4),'#e98275',[.08,1.11,-.63]);pyramid.rotation.y=Math.PI/4;
    cylinder(group,.25,.25,.75,'#76b39f',[.99,.87,-.3]);
  }
  {
    const group=islands[5].group;
    box(group,[1.3,.26,.88],'#6e9eac',[-.05,.67,.15]);
    box(group,[1.2,.19,.81],'#fff3d5',[-.05,.82,.15],.035);
    const book=box(group,[1.15,.28,.82],'#e58975',[.02,1.05,.11]);book.rotation.y=-.18;
    box(group,[1.04,.14,.72],'#fff5e3',[.02,1.2,.11],.02);
    const left=box(group,[.64,.08,.84],'#fff5e3',[-.32,1.38,.11],.03);left.rotation.z=-.18;
    const right=box(group,[.64,.08,.84],'#fff5e3',[.32,1.38,.11],.03);right.rotation.z=.18;
    for(let line=0;line<3;line++){box(left,[.43,.012,.022],'#a8b1a3',[0,.047,-.22+line*.18],.003);box(right,[.43,.012,.022],'#a8b1a3',[0,.047,-.22+line*.18],.003);}
    tree(group,[1.03,.46,.15],.6,'#83b98c');
  }
  const floor=mesh(scene,new THREE.PlaneGeometry(200,200),'#e7f2f4',[0,-.7,0]);floor.rotation.x=-Math.PI/2;floor.castShadow=false;
  floor.material=new THREE.ShadowMaterial({color:'#648c82',opacity:.2});materials.set(Symbol(),floor.material);
  const labels=document.createElement('div');labels.className='world-pins';container.appendChild(labels);
  const names=['Số học','Phép tính','Nhân chia','Đo lường','Hình học','Tư duy'];
  islands.forEach((entry,index)=>{
    const button=document.createElement('button');button.className='world-pin';button.type='button';button.dataset.realm=entry.realm.id;
    button.textContent=names[index];button.setAttribute('aria-label',entry.realm.name);
    button.addEventListener('click',()=>{if(!button.disabled)onSelect(entry.realm.id);});
    button.addEventListener('pointerenter',()=>{entry.hover=1;});button.addEventListener('pointerleave',()=>{entry.hover=0;});
    entry.button=button;labels.appendChild(button);
  });
  let motion=!matchMedia('(prefers-reduced-motion: reduce)').matches,frame=null,visible=true,disposed=false,lost=false,last=0,elapsed=0,renderCount=0;
  let width=1,height=1;
  const pointer=new THREE.Vector2(),raycaster=new THREE.Raycaster(),projected=new THREE.Vector3();
  let press=null;
  function active(){return visible&&!document.hidden&&!disposed&&!lost&&document.body.classList.contains('mode-game')&&!document.body.classList.contains('locked')&&!document.querySelector('#gModal.open,#gardenOv.open,#dashOv.open,#pcOverlay.open,#introOverlay.open');}
  function positionLabels(){islands.forEach(entry=>{projected.copy(entry.group.position).add(new THREE.Vector3(0,-.2,1.42)).project(camera);entry.button.style.left=`${(projected.x*.5+.5)*width}px`;entry.button.style.top=`${(-projected.y*.5+.5)*height}px`;});}
  function render(){if(disposed||lost)return;renderer.render(scene,camera);renderCount++;positionLabels();}
  function stop(){if(frame!==null)cancelAnimationFrame(frame);frame=null;last=0;}
  function tick(time){
    frame=null;if(!active())return;
    if(!last||time-last>=1000/30){const delta=last?Math.min((time-last)/1000,.07):0;last=time;elapsed+=delta;
      spinners.forEach(rotor=>{rotor.rotation.z=elapsed*.3;});
      islands.forEach((entry,index)=>{entry.group.position.y=Math.sin(elapsed*.7+index)*.035;const target=entry.hover&&!entry.button.disabled?1.035:1;entry.group.scale.lerp(new THREE.Vector3(target,target,target),.12);});
      camera.position.x+=(pointer.x*.45-camera.position.x)*.035;camera.lookAt(0,.4,0);render();
    }
    frame=requestAnimationFrame(tick);
  }
  function sync(){stop();if(active()){render();if(motion)frame=requestAnimationFrame(tick);}}
  function resize(){
    const bounds=container.getBoundingClientRect();if(!bounds.width||!bounds.height)return;
    width=bounds.width;height=bounds.height;const mobile=width<620,aspect=width/height,span=Math.max(mobile?18.5:11.5,(mobile?11:17)/aspect);
    camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();
    islands.forEach((entry,index)=>{entry.group.position.set(mobile?(index%2?2.7:-2.7):(index%3-1)*5.1,0,mobile?(Math.floor(index/2)-1)*7.5:(Math.floor(index/3)-.5)*7);});
    renderer.setSize(width,height,false);sync();
  }
  function hover(event){const bounds=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-((event.clientY-bounds.top)/bounds.height)*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(islands.map(entry=>entry.group),true)[0];let owner=hit?.object;while(owner&&!islands.some(entry=>entry.group===owner))owner=owner.parent;islands.forEach(entry=>{entry.hover=entry.group===owner?1:0;});renderer.domElement.style.cursor=islands.some(entry=>entry.hover&&!entry.button.disabled)?'pointer':'default';return islands.find(entry=>entry.group===owner);}
  function beginPress(event){press={x:event.clientX,y:event.clientY};}
  function cancelPress(){press=null;}
  function select(event){const start=press;press=null;if(!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)>8)return;const entry=hover(event);if(entry&&!entry.button.disabled)onSelect(entry.realm.id);}
  function leave(){pointer.set(0,0);islands.forEach(entry=>{entry.hover=0;});}
  function contextLost(event){event.preventDefault();lost=true;stop();container.classList.remove('world-ready');onError?.(new Error('WebGL context lost'));}
  renderer.domElement.addEventListener('pointermove',hover);renderer.domElement.addEventListener('pointerleave',leave);renderer.domElement.addEventListener('click',select);renderer.domElement.addEventListener('webglcontextlost',contextLost);
  renderer.domElement.addEventListener('pointerdown',beginPress);renderer.domElement.addEventListener('pointercancel',cancelPress);
  const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();});intersection.observe(container);
  const sizeObserver=new ResizeObserver(resize);sizeObserver.observe(container);
  const stateObserver=new MutationObserver(sync);stateObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
  ['gModal','gardenOv','dashOv','pcOverlay','introOverlay'].forEach(id=>{const node=document.getElementById(id);if(node)stateObserver.observe(node,{attributes:true,attributeFilter:['class']});});
  document.addEventListener('visibilitychange',sync);
  const media=matchMedia('(prefers-reduced-motion: reduce)');const reduce=()=>{if(media.matches){motion=false;sync();}};media.addEventListener('change',reduce);
  function update(nextRealms){islands.forEach(entry=>{const realm=nextRealms.find(candidate=>candidate.id===entry.realm.id);entry.button.disabled=!realm?.open;entry.button.title=realm?.open?entry.realm.name:`Mở tại trạm ${entry.realm.need}`;entry.button.classList.toggle('is-locked',!realm?.open);});sync();}
  resize();container.classList.add('world-ready');
  return {
    update,setMotion(value){motion=!!value&&!media.matches;sync();},sync,
    stats(){return {frames:renderCount,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,running:frame!==null,motion,lost};},
    dispose(){disposed=true;stop();intersection.disconnect();sizeObserver.disconnect();stateObserver.disconnect();document.removeEventListener('visibilitychange',sync);media.removeEventListener('change',reduce);renderer.dispose();geometries.forEach(geometry=>geometry.dispose());materials.forEach(surface=>surface.dispose());textures.forEach(texture=>texture.dispose());renderer.domElement.remove();labels.remove();container.classList.remove('world-ready');}
  };
}