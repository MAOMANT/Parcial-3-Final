// main.js — versión optimizada con navegación SPA
import * as THREE from 'https://unpkg.com/three@0.152.2/build/three.module.js';

// Renderer y escena
const canvas = document.getElementById('fondo');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x001624, 0.03);

// Cámara
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 100);
camera.position.set(0, 0.6, 2.6);
scene.add(camera);

// Luces
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(2, 6, 2);
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0x9fcffb, 0.2));

// ---------- Esfera volumétrica (shader inmersivo) ----------
const sphereGeo = new THREE.SphereGeometry(20, 64, 64);
const uniforms = {
  time: { value: 0.0 },
  lightPos: { value: dirLight.position.clone() },
  deepColor: { value: new THREE.Color(0x022234) },
  midColor: { value: new THREE.Color(0x0a4b68) },
  shallowColor: { value: new THREE.Color(0x4ccfff) },
  causticIntensity: { value: 0.6 },
  fogStrength: { value: 0.6 }
};

const vshader = `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec2 vUv;
  uniform float time;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
  float noise(vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f*f*(3.0 - 2.0*f);
    return mix(a, b, u.x) + (c - a)*u.y*(1.0 - u.x) + (d - b)*u.x*u.y;
  }

  void main(){
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec3 wpos = (modelMatrix * vec4(position, 1.0)).xyz;
    float n = noise(uv * 6.0 + time * 0.06);
    float wobble = (sin(uv.y * 10.0 + time * 0.8) * 0.06 + (n - 0.5) * 0.12);
    vec3 pos = position + normal * wobble;
    vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fshader = `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec2 vUv;
  uniform vec3 lightPos;
  uniform vec3 deepColor;
  uniform vec3 midColor;
  uniform vec3 shallowColor;
  uniform float time;
  uniform float causticIntensity;
  uniform float fogStrength;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
  float noise(vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f*f*(3.0 - 2.0*f);
    return mix(a, b, u.x) + (c - a)*u.y*(1.0 - u.x) + (d - b)*u.x*u.y;
  }

  float caustic(vec2 uv){
    float n = 0.0;
    n += 0.6 * noise(uv * 8.0 + time * 1.6);
    n += 0.3 * noise(uv * 14.0 - time * 0.9);
    n += 0.15 * noise(uv * 28.0 + time * 2.5);
    return n;
  }

  void main(){
    float depthFactor = clamp((vWorldPos.y + 3.0) * 0.28, 0.0, 1.0);
    vec3 base = mix(deepColor, midColor, depthFactor);
    base = mix(base, shallowColor, pow(depthFactor, 1.6));

    vec3 N = normalize(vNormal);
    vec3 L = normalize(lightPos - vWorldPos);
    float diff = max(dot(N, L), 0.0);
    vec3 V = normalize(-vWorldPos);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.0);

    float c = caustic(vUv);
    float caust = smoothstep(0.3, 0.9, c) * causticIntensity;

    float shafts = max(0.0, sin((vWorldPos.y + 2.0) * 3.2 + time * 0.9) * 0.5 + 0.5);
    shafts *= smoothstep(0.0, 1.0, dot(N, vec3(0.0,1.0,0.0)));

    vec3 color = base * (0.45 + diff * 0.9) + vec3(0.9,1.0,1.0) * fres * 0.6;
    color += vec3(1.0,0.98,0.88) * caust * 0.35;
    color += vec3(0.6,0.9,1.0) * shafts * 0.12;

    color = mix(color, deepColor, 1.0 - exp(-fogStrength * length(vWorldPos) * 0.06));

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;

const mat = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: vshader,
  fragmentShader: fshader,
  side: THREE.BackSide
});
const sphere = new THREE.Mesh(sphereGeo, mat);
scene.add(sphere);

// ---------- Burbujas esféricas reales (translúcidas) ----------
const bubbleGroup = new THREE.Group();
scene.add(bubbleGroup);
const bubbleMaterial = new THREE.MeshPhongMaterial({
  color: 0xaee6ff,
  transparent: true,
  opacity: 0.35,
  shininess: 80
});

for (let i = 0; i < 30; i++) {
  const size = Math.random() * 0.12 + 0.05;
  const geo = new THREE.SphereGeometry(size, 16, 16);
  const bubble = new THREE.Mesh(geo, bubbleMaterial);
  bubble.position.set((Math.random() - 0.5) * 6, -2 - Math.random() * 2, (Math.random() - 0.5) * 6);
  bubble.userData.speed = 0.004 + Math.random() * 0.002;
  bubbleGroup.add(bubble);
}

// ---------- SISTEMA DE NAVEGACIÓN SPA ----------
document.addEventListener('DOMContentLoaded', () => {
  const menuItems = Array.from(document.querySelectorAll('.item'));
  const secciones = Array.from(document.querySelectorAll('.seccion'));
  const botonesVolver = Array.from(document.querySelectorAll('.volver'));
  const overlay = document.querySelector('.overlay');

  function mostrarSeccion(id) {
    // Ocultar todas las secciones
    secciones.forEach(s => {
      s.classList.remove('activa');
      s.style.display = 'none';
      s.style.opacity = 0;
    });

    // Mostrar sección objetivo
    const target = document.getElementById(id);
    if (target) {
      target.style.display = 'flex';
      requestAnimationFrame(() => {
        target.classList.add('activa');
        target.style.opacity = 1;
      });
      
      // Ocultar overlay principal cuando se muestra una sección
      overlay.style.display = 'none';
    }

    // Actualizar estado activo del menú
    menuItems.forEach(mi => {
      if (mi.getAttribute('data-section') === id) {
        mi.classList.add('activo');
      } else {
        mi.classList.remove('activo');
      }
    });
  }

  function volverAlInicio() {
    secciones.forEach(s => {
      s.classList.remove('activa');
      s.style.display = 'none';
      s.style.opacity = 0;
    });
    
    // Mostrar overlay principal
    overlay.style.display = 'block';
    
    // Quitar estado activo del menú
    menuItems.forEach(mi => mi.classList.remove('activo'));
  }

  // Event listeners para menú
  menuItems.forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const id = item.getAttribute('data-section');
      if (id) mostrarSeccion(id);
    });
  });

  // Event listeners para botones volver
  botonesVolver.forEach(btn => {
    btn.addEventListener('click', volverAlInicio);
  });

  // Inicializar con la sección activa o mostrar overlay
  const seccionInicial = secciones.find(s => s.classList.contains('activa'));
  if (seccionInicial) {
    mostrarSeccion(seccionInicial.id);
  } else {
    volverAlInicio();
  }
});

// ---------- ANIMACIÓN PRINCIPAL ----------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  uniforms.time.value = t;

  // Movimiento suave de cámara
  camera.position.x = Math.sin(t * 0.05) * 0.1;
  camera.position.y = 0.6 + Math.sin(t * 0.1) * 0.05;
  camera.lookAt(0, 0.5, 0);

  // Movimiento de burbujas
  bubbleGroup.children.forEach(bubble => {
    bubble.position.y += bubble.userData.speed;
    if (bubble.position.y > 2.5) {
      bubble.position.y = -2 - Math.random() * 1.5;
      bubble.position.x = (Math.random() - 0.5) * 6;
      bubble.position.z = (Math.random() - 0.5) * 6;
    }
  });

  renderer.render(scene, camera);
}
animate();

// ---------- AJUSTE AL REDIMENSIONAR ----------
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});