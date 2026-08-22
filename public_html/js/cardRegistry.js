/**
 * Card Registry — fixed, manual render logic per card (SDD 3.2 / 3.4).
 * The LLM never generates geometry or code: it only picks a card name +
 * parameters. This module is the single place that turns (card, params)
 * into a THREE.Object3D. Keeping this "fixed" is a core security property:
 * there is no eval()/new Function() anywhere in this pipeline.
 */
import * as THREE from "three";
import { getProceduralTexture } from "./proceduralTextures.js";

const COLOR = {
  green: 0x3a7d44,
  autumn_orange: 0xd97a2b,
  dead_brown: 0x6b4a2f,
  pink: 0xe98ab0,
  red: 0xc23b3b,
  yellow: 0xe8c547,
  purple: 0x9b59b6,
  white: 0xf4f4f4,
  blue: 0x2f6fbb,
  teal: 0x2b9b98,
  murky_green: 0x4a5d3a,
  wood: 0x8a5a3b,
  stone: 0x9a958c,
  metal: 0xb0b4b8,
  stone_wall: 0x9a958c,
  wood_brown: 0x7a5230,
  white_plaster: 0xece6d8,
  dark_wood: 0x3d2b1f,
  slate_gray: 0x4b5259,
  brick: 0x9c4b3a,
  wood_fence: 0x8a5a3b,
  black: 0x1c1c1c,
};

function colorOf(key, fallback = 0x999999) {
  return COLOR[key] ?? fallback;
}

/**
 * Attach a procedural color+normal map pair (see proceduralTextures.js) to a
 * MeshStandardMaterial/MeshPhysicalMaterial options object, in place of a
 * flat color fill. `colorHex` both tints the generated texture and stays as
 * `color` on the material itself (multiplied with the map), so the result
 * still respects the requested hue exactly, just with real surface detail.
 */
function withTexture(matOptions, type, colorHex) {
  const tex = getProceduralTexture(type, colorHex);
  if (tex) {
    matOptions.map = tex.map;
    matOptions.normalMap = tex.normalMap;
    matOptions.roughnessMap = tex.roughnessMap;
  }
  return matOptions;
}

function makeGroup(id, card) {
  const g = new THREE.Group();
  g.name = id;
  g.userData.card = card;
  return g;
}

const builders = {
  tree(params) {
    const height = params.height ?? 2;
    const leafColor = colorOf(params.leaf_color ?? "green");
    const twisted = params.trunk_style === "twisted";

    const trunkGeo = new THREE.CylinderGeometry(0.12 * height / 2, 0.16 * height / 2, height * 0.5, 14);
    const trunkMat = new THREE.MeshStandardMaterial(withTexture({ color: 0x5c4023, roughness: 0.9 }, "bark", 0x5c4023));
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = height * 0.25;
    if (twisted) trunk.rotation.y = Math.PI / 6;
    trunk.castShadow = true;

    const foliageMat = new THREE.MeshStandardMaterial(withTexture({ color: leafColor, roughness: 0.8 }, "leaf", leafColor));
    const foliage = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const r = (height * 0.45) * (1 - i * 0.18);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, height * 0.42, 16), foliageMat);
      cone.position.y = height * 0.55 + i * height * 0.28;
      cone.castShadow = true;
      foliage.add(cone);
    }

    const group = new THREE.Group();
    group.add(trunk, foliage);
    return group;
  },

  rock(params) {
    const size = params.size ?? 1;
    const shape = params.shape ?? "round";
    let geo;
    if (shape === "angular") geo = new THREE.DodecahedronGeometry(size * 0.6, 0);
    else if (shape === "flat") geo = new THREE.SphereGeometry(size * 0.6, 6, 4);
    else geo = new THREE.IcosahedronGeometry(size * 0.6, 1);
    const mat = new THREE.MeshStandardMaterial(withTexture({ color: 0x8b8b86, roughness: 1, flatShading: true }, "stone", 0x8b8b86));
    const mesh = new THREE.Mesh(geo, mat);
    if (shape === "flat") mesh.scale.y = 0.4;
    mesh.position.y = size * 0.3;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  },

  flower_bush(params) {
    const size = params.size ?? 0.8;
    const flowerColor = colorOf(params.flower_color ?? "pink");
    const group = new THREE.Group();
    const bushMat = new THREE.MeshStandardMaterial(withTexture({ color: 0x3e6b3a, roughness: 0.9 }, "leaf", 0x3e6b3a));
    const bush = new THREE.Mesh(new THREE.SphereGeometry(size * 0.5, 14, 10), bushMat);
    bush.position.y = size * 0.4;
    bush.castShadow = true;
    group.add(bush);
    const flowerMat = new THREE.MeshStandardMaterial({ color: flowerColor, roughness: 0.6 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const f = new THREE.Mesh(new THREE.SphereGeometry(size * 0.1, 6, 6), flowerMat);
      f.position.set(Math.cos(a) * size * 0.4, size * 0.5 + Math.sin(i) * 0.1, Math.sin(a) * size * 0.4);
      group.add(f);
    }
    return group;
  },

  mountain(params) {
    const height = params.height ?? 6;
    const snow = params.snow_capped ?? true;
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a5f6b, roughness: 1, flatShading: true });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(height * 0.7, height, 5), mat);
    cone.position.y = height / 2;
    cone.castShadow = true;
    group.add(cone);
    if (snow) {
      const snowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
      const cap = new THREE.Mesh(new THREE.ConeGeometry(height * 0.25, height * 0.3, 5), snowMat);
      cap.position.y = height * 0.88;
      group.add(cap);
    }
    return group;
  },

  pond(params) {
    const radius = params.radius ?? 2;
    const water = colorOf(params.water_color ?? "blue");
    // Real refraction (not a flat alpha-blend) via transmission + water's
    // actual index of refraction — needs scene.environment (already set via
    // the PMREM room environment in app.js) to have something to refract.
    // roughness/transmission kept short of "perfect mirror" on purpose:
    // a near-0 roughness here catches RoomEnvironment's bright point light
    // as a hard specular hotspot that UnrealBloomPass then blows out into
    // a visible white blob — reported as "over lighting" on the landing
    // hero preview, which uses the same card render logic.
    const mat = new THREE.MeshPhysicalMaterial({
      color: water,
      roughness: 0.15,
      metalness: 0,
      transmission: 0.9,
      thickness: 0.6,
      ior: 1.33,
    });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.95, 0.08, 32), mat);
    mesh.position.y = 0.04;
    mesh.receiveShadow = true;
    return mesh;
  },

  bench(params) {
    const material = params.material ?? "wood";
    const benchColor = colorOf(material);
    const mat = new THREE.MeshStandardMaterial(
      material === "wood" ? withTexture({ color: benchColor, roughness: 0.8 }, "bark", benchColor) : { color: benchColor, roughness: 0.8 }
    );
    const group = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.5), mat);
    seat.position.y = 0.45;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.08), mat);
    back.position.set(0, 0.7, -0.21);
    group.add(seat, back);
    const legGeo = new THREE.BoxGeometry(0.08, 0.45, 0.45);
    [[-0.6, 0.225, 0], [0.6, 0.225, 0]].forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(legGeo, mat);
      leg.position.set(x, y, z);
      group.add(leg);
    });
    group.traverse((o) => (o.castShadow = true));
    return group;
  },

  fountain(params) {
    const size = params.size ?? 1.5;
    const tiers = Math.max(1, Math.min(3, Math.round(params.tiers ?? 2)));
    const stoneMat = new THREE.MeshStandardMaterial(withTexture({ color: 0xb7b2a6, roughness: 0.85 }, "stone", 0xb7b2a6));
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x3a8fd1, roughness: 0.2, metalness: 0, transmission: 0.9, thickness: 0.3, ior: 1.33,
    });
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(size, size * 1.05, 0.25, 28), stoneMat);
    base.position.y = 0.125;
    group.add(base);
    const waterBase = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.92, size * 0.92, 0.06, 28), waterMat);
    waterBase.position.y = 0.26;
    group.add(waterBase);
    let y = 0.35;
    for (let i = 0; i < tiers; i++) {
      const r = size * (0.65 - i * 0.2);
      const tier = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, 0.35, 24), stoneMat);
      tier.position.y = y + 0.175;
      group.add(tier);
      y += 0.4;
    }
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.4, 12), stoneMat);
    spout.position.y = y + 0.2;
    group.add(spout);
    group.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    return group;
  },

  lamp(params) {
    const style = params.style ?? "street";
    const warm = params.glow_warm ?? true;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6, metalness: 0.5 });
    const group = new THREE.Group();
    const height = style === "lantern" ? 1.6 : 2.6;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, height, 14), poleMat);
    pole.position.y = height / 2;
    group.add(pole);
    const bulbColor = warm ? 0xffd27a : 0xcfe8ff;
    const bulbMat = new THREE.MeshStandardMaterial({ color: bulbColor, emissive: bulbColor, emissiveIntensity: 1.2 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), bulbMat);
    bulb.position.y = height + 0.05;
    group.add(bulb);
    const light = new THREE.PointLight(bulbColor, 0.8, 6, 2);
    light.position.copy(bulb.position);
    group.add(light);
    if (style === "street") {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.04), poleMat);
      arm.position.set(0.13, height - 0.02, 0);
      group.add(arm);
    }
    group.castShadow = true;
    return group;
  },

  gazebo(params) {
    const size = params.size ?? 3;
    const woodMat = new THREE.MeshStandardMaterial(withTexture({ color: 0x8a5a3b, roughness: 0.85 }, "bark", 0x8a5a3b));
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x5c3b26, roughness: 0.8 });
    const group = new THREE.Group();
    const postGeo = new THREE.CylinderGeometry(size * 0.04, size * 0.04, size * 0.75, 14);
    const r = size * 0.45;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const post = new THREE.Mesh(postGeo, woodMat);
      post.position.set(Math.cos(a) * r, size * 0.375, Math.sin(a) * r);
      group.add(post);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(size * 0.62, size * 0.5, 6), roofMat);
    roof.position.y = size * 0.75 + size * 0.25;
    group.add(roof);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.06, 6), woodMat);
    floor.position.y = 0.03;
    group.add(floor);
    group.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    return group;
  },

  house(params) {
    const width = params.width ?? 4;
    const depth = width * 0.85;
    const wallColor = colorOf(params.wall_color ?? "stone");
    const roofColor = colorOf(params.roof_color ?? "dark_wood");
    const chimney = params.chimney ?? true;
    const group = new THREE.Group();
    const wallTexType = params.wall_color === "stone" || !params.wall_color ? "stone" : params.wall_color === "wood_brown" ? "bark" : null;
    const wallMat = new THREE.MeshStandardMaterial(
      wallTexType ? withTexture({ color: wallColor, roughness: 0.9 }, wallTexType, wallColor) : { color: wallColor, roughness: 0.9 }
    );
    const wallHeight = width * 0.5;
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, wallHeight, depth), wallMat);
    body.position.y = wallHeight / 2;
    group.add(body);

    const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.8 });
    const roof = new THREE.Mesh(new THREE.ConeGeometry(width * 0.75, width * 0.45, 4), roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = wallHeight + width * 0.22;
    group.add(roof);

    const doorMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.7 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(width * 0.16, wallHeight * 0.55, 0.06), doorMat);
    door.position.set(0, wallHeight * 0.275, depth / 2 + 0.03);
    group.add(door);

    const winMat = new THREE.MeshStandardMaterial({ color: 0xffdd88, emissive: 0xffbb55, emissiveIntensity: 1.1 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.8 });
    [-width * 0.28, width * 0.28].forEach((x) => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(width * 0.18, width * 0.18, 0.05), frameMat);
      frame.position.set(x, wallHeight * 0.55, depth / 2 + 0.02);
      group.add(frame);
      const win = new THREE.Mesh(new THREE.BoxGeometry(width * 0.14, width * 0.14, 0.06), winMat);
      win.position.set(x, wallHeight * 0.55, depth / 2 + 0.04);
      group.add(win);
    });
    // side windows for a bit more architectural depth
    [-depth * 0.28, depth * 0.28].forEach((z) => {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, width * 0.12, width * 0.12), winMat);
      win.position.set(width / 2 + 0.03, wallHeight * 0.55, z);
      group.add(win);
    });

    // roof overhang trim so the roof reads as a distinct architectural layer
    const trim = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.78, width * 0.78, width * 0.05, 4), roofMat);
    trim.rotation.y = Math.PI / 4;
    trim.position.y = wallHeight + 0.02;
    group.add(trim);

    // porch light beside the door — small emissive glow, no extra PointLight
    // (keeps per-object cost low even with many houses in a scene)
    const porchGlowMat = new THREE.MeshStandardMaterial({ color: 0xffdd99, emissive: 0xffb454, emissiveIntensity: 1.1 });
    const porchLight = new THREE.Mesh(new THREE.SphereGeometry(width * 0.035, 8, 8), porchGlowMat);
    porchLight.position.set(width * 0.12, wallHeight * 0.4, depth / 2 + 0.05);
    group.add(porchLight);

    if (chimney) {
      const chim = new THREE.Mesh(new THREE.BoxGeometry(width * 0.12, width * 0.35, width * 0.12), wallMat);
      chim.position.set(width * 0.28, wallHeight + width * 0.35, -depth * 0.15);
      group.add(chim);
    }
    group.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    return group;
  },

  building(params) {
    const height = params.height ?? 8;
    const style = params.style ?? "glass_blue";
    const width = 2.4, depth = 2.4;
    const group = new THREE.Group();

    const bodyMat = {
      glass_blue: new THREE.MeshStandardMaterial({ color: 0x30506e, roughness: 0.25, metalness: 0.55 }),
      concrete: new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.9 }),
      brick_red: new THREE.MeshStandardMaterial({ color: 0x8a4636, roughness: 0.85 }),
    }[style] || new THREE.MeshStandardMaterial({ color: 0x30506e, roughness: 0.3, metalness: 0.5 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), bodyMat);
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // window grid — one InstancedMesh per face, cheap even for tall buildings
    const floors = Math.max(2, Math.round(height / 0.65));
    const winMat = new THREE.MeshStandardMaterial({
      color: style === "glass_blue" ? 0xbfe4ff : 0xffe6a8,
      emissive: style === "glass_blue" ? 0x6fb8e8 : 0xffc266,
      emissiveIntensity: 1.05,
      roughness: 0.4,
    });
    const winGeo = new THREE.BoxGeometry(0.22, 0.34, 0.03);
    const colsFront = 3, colsSide = 3;
    const totalWindows = floors * (colsFront * 2 + colsSide * 2);
    const winMesh = new THREE.InstancedMesh(winGeo, winMat, totalWindows);
    const m = new THREE.Matrix4();
    let idx = 0;
    for (let f = 0; f < floors; f++) {
      const y = 0.5 + f * (height / floors);
      if (y > height - 0.2) continue;
      for (let c = 0; c < colsFront; c++) {
        const x = (c - (colsFront - 1) / 2) * (width / (colsFront + 0.6));
        m.makeTranslation(x, y, depth / 2 + 0.02);
        winMesh.setMatrixAt(idx++, m);
        m.makeRotationY(Math.PI);
        m.setPosition(x, y, -depth / 2 - 0.02);
        winMesh.setMatrixAt(idx++, m);
      }
      for (let c = 0; c < colsSide; c++) {
        const z = (c - (colsSide - 1) / 2) * (depth / (colsSide + 0.6));
        m.makeRotationY(Math.PI / 2);
        m.setPosition(width / 2 + 0.02, y, z);
        winMesh.setMatrixAt(idx++, m);
        m.makeRotationY(-Math.PI / 2);
        m.setPosition(-width / 2 - 0.02, y, z);
        winMesh.setMatrixAt(idx++, m);
      }
    }
    winMesh.count = idx;
    winMesh.instanceMatrix.needsUpdate = true;
    group.add(winMesh);

    // rooftop cap + antenna for silhouette variety
    const capMat = new THREE.MeshStandardMaterial({ color: 0x22262f, roughness: 0.7 });
    const cap = new THREE.Mesh(new THREE.BoxGeometry(width * 1.06, 0.12, depth * 1.06), capMat);
    cap.position.y = height + 0.06;
    cap.castShadow = true;
    group.add(cap);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, height * 0.18, 6), capMat);
    antenna.position.y = height + height * 0.09;
    group.add(antenna);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 6, 6),
      // Saturated red has low perceived luminance, so it needs a much
      // higher emissiveIntensity than a warm-white light to clear the
      // bloom pass's luminance threshold and actually glow.
      new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff2222, emissiveIntensity: 3.2 })
    );
    beacon.position.y = height + height * 0.18;
    group.add(beacon);

    return group;
  },

  terrain(params) {
    const radius = params.radius ?? 3;
    const surface = params.surface ?? "grass";
    const colorMap = { grass: 0x3d6b3f, sand: 0xd9c48a, snow: 0xf2f5fa, rocky: 0x7a7772 };
    // CircleGeometry is a fan from the center — one ring of edge vertices
    // and nothing in between, so a displacement loop over it can only ever
    // move the rim (coarse, faceted). RingGeometry(0, radius, ...) gives an
    // actual radial grid (phiSegments rings between center and edge) using
    // the same x/y-plane, z-up layout, so the hill bump below reads as a
    // real dome instead of a flat-sided cone.
    const geo = new THREE.RingGeometry(0, radius, 48, 8);
    // gentle hill bump via vertex displacement — cheap stand-in for a
    // heightmap/noise-based terrain, enough to break up a flat ground plane
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const d = Math.sqrt(x * x + y * y) / radius;
      const bump = Math.cos((d * Math.PI) / 2) * (radius * 0.09);
      pos.setZ(i, bump + (Math.random() - 0.5) * 0.03);
    }
    geo.computeVertexNormals();
    const texType = surface === "grass" ? "grass" : surface === "rocky" ? "stone" : null;
    const baseColor = colorMap[surface] ?? colorMap.grass;
    const mat = new THREE.MeshStandardMaterial(
      texType ? withTexture({ color: baseColor, roughness: 1, flatShading: surface === "rocky" }, texType, baseColor)
        : { color: baseColor, roughness: 1, flatShading: surface === "rocky" }
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.01;
    mesh.receiveShadow = true;
    return mesh;
  },

  wall(params) {
    const length = params.length ?? 4;
    const material = params.material ?? "stone";
    const isStone = material !== "wood_fence";
    const wallColor = colorOf(material === "wood_fence" ? "wood_fence" : material);
    const mat = new THREE.MeshStandardMaterial(
      isStone ? withTexture({ color: wallColor, roughness: 0.9 }, "stone", wallColor) : { color: wallColor, roughness: 0.9 }
    );
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, 0.6, 0.2), mat);
    mesh.position.y = 0.3;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  },

  path(params) {
    const length = params.length ?? 5;
    const width = params.width ?? 1;
    const mat = new THREE.MeshStandardMaterial({ color: 0xb0a99a, roughness: 1 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, length), mat);
    mesh.position.y = 0.02;
    mesh.receiveShadow = true;
    return mesh;
  },

  car(params) {
    const bodyColor = colorOf(params.color ?? "red");
    const style = params.style ?? "sedan";
    const group = new THREE.Group();
    // Clearcoat layer over the base paint is what actually reads as "car
    // paint" rather than plain painted metal — a thin, near-mirror lacquer
    // coat on top of a duller base color.
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: bodyColor, roughness: 0.4, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.1,
    });
    const h = style === "truck" ? 0.55 : 0.4;
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, h, 0.95), bodyMat);
    body.position.y = 0.35 + h / 2;
    group.add(body);
    if (style !== "truck") {
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 0.85), bodyMat);
      cabin.position.set(-0.1, 0.35 + h + 0.175, 0);
      group.add(cabin);
    }
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.2, 20);
    [[-0.7, -0.45], [0.7, -0.45], [-0.7, 0.45], [0.7, 0.45]].forEach(([x, z]) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.28, z);
      group.add(wheel);
    });
    group.traverse((o) => { o.castShadow = true; });
    return group;
  },

  cloud(params) {
    const size = params.size ?? 2;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.9 });
    const group = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const s = size * (0.3 + Math.random() * 0.25);
      const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 14, 10), mat);
      puff.position.set((i - 1.5) * size * 0.3, Math.random() * size * 0.1, 0);
      group.add(puff);
    }
    return group;
  },

  campfire(params) {
    const size = params.size ?? 1;
    const group = new THREE.Group();
    const logMat = new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 0.9 });
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * size, 0.05 * size, 0.6 * size, 10), logMat);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i / 4) * Math.PI;
      log.position.y = 0.05 * size;
      group.add(log);
    }
    const flameMat = new THREE.MeshStandardMaterial({ color: 0xff8c2b, emissive: 0xff6a00, emissiveIntensity: 1.5 });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.18 * size, 0.5 * size, 12), flameMat);
    flame.position.y = 0.35 * size;
    group.add(flame);
    const light = new THREE.PointLight(0xff8c2b, 1.2, 5, 2);
    light.position.y = 0.4 * size;
    group.add(light);
    return group;
  },
};

/**
 * Build a THREE.Object3D for the given card + params. Returns null if the
 * card is not in the registry (should never happen if whitelist validation
 * upstream — client + server — did its job, but we fail safe here too).
 */
export function buildCardObject(id, cardName, params = {}) {
  const builder = builders[cardName];
  if (!builder) return null;
  const obj = builder(params);
  const wrapper = makeGroup(id, cardName);
  wrapper.add(obj);
  return wrapper;
}

export const REGISTERED_CARDS = Object.keys(builders);
