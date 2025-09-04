var __defProp = Object.defineProperty;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __objRest = (source, exclude) => {
  var target = {};
  for (var prop in source)
    if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
      target[prop] = source[prop];
  if (source != null && __getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(source)) {
      if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
        target[prop] = source[prop];
    }
  return target;
};
import React, { useRef, useLayoutEffect } from "react";
const DEFAULT_CONFIG = {
  starsCount: 400,
  starsColor: "#FFFFFF",
  starsRotationSpeed: 3,
  cometFrequence: 15,
  nebulasIntensity: 10,
  bgColor: "rgb(8,8,8)",
  sunScale: 1,
  planetsScale: 1,
  solarSystemOrbite: 65,
  solarSystemSpeedOrbit: 100
};
const fillConfig = (config) => {
  return Object.assign({}, DEFAULT_CONFIG, config);
};
const parseColor = (color) => {
  const rgb = color.includes("#") ? hexToRGB(color) : color;
  const split = rgb.split(/[\(|,|\)]/);
  return [
    parseInt(split[1], 10),
    parseInt(split[2], 10),
    parseInt(split[3], 10)
  ];
};
function hexToRGB(color) {
  let r = "0", g = "0", b = "0";
  if (color.length <= 5) {
    r = "0x" + color[1] + color[1];
    g = "0x" + color[2] + color[2];
    b = "0x" + color[3] + color[3];
  } else if (color.length >= 7) {
    r = "0x" + color[1] + color[2];
    g = "0x" + color[3] + color[4];
    b = "0x" + color[5] + color[6];
  }
  return "rgb(" + +r + "," + +g + "," + +b + ")";
}
const getRGB = (rgbChannels, opacity) => {
  return `rgba(${rgbChannels[0]}, ${rgbChannels[1]}, ${rgbChannels[2]}, ${opacity})`;
};
class Drawable {
  constructor({ ctx }) {
    this.ctx = ctx;
  }
  getCanvasWidth() {
    return this.ctx.canvas.width;
  }
  getCanvasHeight() {
    return this.ctx.canvas.height;
  }
  get canvasMinSide() {
    return Math.min(this.getCanvasHeight(), this.getCanvasWidth());
  }
  get canvasMaxSide() {
    return Math.max(this.getCanvasHeight(), this.getCanvasWidth());
  }
}
class Astre extends Drawable {
  constructor({
    ctx,
    width,
    speed,
    distance,
    rgb,
    origin,
    startAngle = Math.random() * 360
  }) {
    super({ ctx });
    this.relativeWidth = width;
    this.rgb = rgb;
    this.speed = speed;
    this.relativeDistance = distance;
    this.origin = origin;
    this.angle = Math.PI / 180 * (startAngle != null ? startAngle : 0);
  }
  rotate() {
    this.angle = (this.angle + Math.PI / 180 * this.speed) % 360;
  }
  get width() {
    return this.relativeWidth / 100 * this.canvasMinSide;
  }
  get distance() {
    return this.relativeDistance / 100 * this.canvasMinSide;
  }
  getAngle() {
    return this.angle;
  }
  getRefAngle() {
    var _a, _b;
    return this.getAngle() + ((_b = (_a = this.origin) == null ? void 0 : _a.getAngle()) != null ? _b : 0);
  }
  getWidth() {
    return this.width;
  }
  getOriginCoords() {
    if (!this.origin) {
      const orbitOriginCoords = [
        this.getCanvasWidth() / 2,
        this.getCanvasHeight() / 2
      ];
      return [
        orbitOriginCoords[0] + Math.cos(this.angle) * this.distance,
        orbitOriginCoords[1] + Math.sin(this.angle) * this.distance
      ];
    } else {
      const orbitOriginCoords = this.origin.getOriginCoords();
      return [
        orbitOriginCoords[0] + Math.cos(this.origin.getAngle() + this.angle) * (this.distance + this.origin.getWidth()),
        orbitOriginCoords[1] + Math.sin(this.origin.getAngle() + this.angle) * (this.distance + this.origin.getWidth())
      ];
    }
  }
}
const roundCoords = (coords) => {
  return [Math.round(coords[0]), Math.round(coords[1])];
};
class Star extends Astre {
  constructor(_a) {
    var args = __objRest(_a, []);
    super(__spreadValues({}, args));
    this.draw = () => {
      this.rotate();
      this.ctx.shadowBlur = 0;
      this.ctx.beginPath();
      const orginalCoords = roundCoords(this.getOriginCoords());
      this.ctx.arc(...orginalCoords, Math.round(this.width), 0, Math.PI * 2);
      this.ctx.closePath();
      this.ctx.fillStyle = `rgba(${this.rgb[0]}, ${this.rgb[1]}, ${this.rgb[2]}, 1)`;
      this.ctx.fill();
    };
  }
}
const Random = {
  between: (min, max) => min + Math.random() * (max - min),
  around: (value, tolerance, unit) => {
    if (unit === "%") {
      tolerance = tolerance * value;
    }
    return value - tolerance + Math.random() * tolerance * 2;
  },
  positiveOrNegative: () => Math.random() > 0.5 ? 1 : -1,
  randomizeArray: (array) => {
    const newArray = array.slice();
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = newArray[i];
      newArray[i] = newArray[j];
      newArray[j] = temp;
    }
    return newArray;
  }
};
const generateStars = ({
  stars,
  count,
  color,
  rotationSpeed,
  ctx
}) => {
  let totalStars;
  const missingStars = count - stars.length;
  if (missingStars <= 0) {
    totalStars = stars.slice(0, count);
  } else {
    const newStars = new Array(missingStars).fill(0).map(() => new Star({
      ctx,
      width: Random.between(0.03, 0.1),
      distance: 120 * Math.pow(Math.random() * Math.random(), 1 / 2),
      speed: Random.around(rotationSpeed * 0.015, 5e-3),
      rgb: parseColor(color)
    }));
    totalStars = stars.concat(newStars);
  }
  return totalStars.map((star) => {
    star.speed = Random.around(rotationSpeed * 0.015, 5e-3);
    return star;
  });
};
const drawOnCanvas = ({
  canvas,
  drawings,
  bgColor,
  fps = 0
}) => {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx)
    return () => void 0;
  ctx.save();
  let animation;
  let lastTimestamp = 0;
  let timeStep = 1e3 / fps;
  const drawMainCanvas = () => {
    if (fps) {
      animation = requestAnimationFrame(drawMainCanvas);
      const timestamp = Date.now();
      if (timestamp - lastTimestamp < timeStep)
        return;
      lastTimestamp = timestamp;
    }
    ctx.clearRect(0, 0, width, height);
    if (bgColor) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
    }
    drawings.forEach((drawing) => drawing.draw());
  };
  drawMainCanvas();
  return () => {
    ctx.restore();
    if (animation) {
      cancelAnimationFrame(animation);
    }
  };
};
class Sun extends Astre {
  constructor(_b) {
    var args = __objRest(_b, []);
    super(__spreadValues({}, args));
    this.draw = () => {
      this.rotate();
      this.ctx.shadowBlur = 0;
      this.ctx.beginPath();
      const orginalCoords = roundCoords(this.getOriginCoords());
      this.ctx.arc(...orginalCoords, Math.round(this.width), 0, Math.PI * 2);
      this.ctx.fillStyle = "white";
      this.ctx.fill();
      this.ctx.closePath();
      this.ctx.beginPath();
      this.ctx.arc(...orginalCoords, Math.round(this.width * 5), 0, Math.PI * 2);
      this.ctx.closePath();
      this.ctx.fillStyle = this.getGradiant();
      this.ctx.fill();
    };
  }
  getGradiant() {
    const orginalCoords = roundCoords(this.getOriginCoords());
    const gradient = this.ctx.createRadialGradient(...orginalCoords, 0, ...orginalCoords, Math.round(this.width * 5));
    gradient.addColorStop(0, getRGB(this.rgb, 0.2));
    gradient.addColorStop(0.1, getRGB(this.rgb, 0.3));
    gradient.addColorStop(0.16, getRGB(this.rgb, 0.6));
    gradient.addColorStop(0.2, getRGB(this.rgb, 1));
    gradient.addColorStop(0.2, getRGB(this.rgb, 0.4));
    gradient.addColorStop(0.23, getRGB(this.rgb, 0.08));
    gradient.addColorStop(0.5, getRGB(this.rgb, 0.02));
    gradient.addColorStop(0.9, getRGB(this.rgb, 5e-3));
    gradient.addColorStop(1, getRGB(this.rgb, 0));
    return gradient;
  }
}
class Planet extends Astre {
  constructor(_c) {
    var args = __objRest(_c, []);
    super(__spreadValues({}, args));
    this.draw = () => {
      this.rotate();
      this.ctx.shadowBlur = 0;
      this.ctx.beginPath();
      const originalCoords = roundCoords(this.getOriginCoords());
      this.ctx.arc(...originalCoords, Math.round(this.width), 0, Math.PI * 2);
      this.ctx.fillStyle = "black";
      this.ctx.fill();
      this.ctx.closePath();
      const gradient = this.ctx.createRadialGradient(Math.round(originalCoords[0] - 0.4 * this.width * Math.cos(this.getRefAngle())), Math.round(originalCoords[1] - 0.4 * this.width * Math.sin(this.getRefAngle())), 0, ...originalCoords, Math.round(this.width));
      gradient.addColorStop(0, getRGB(this.rgb, 1));
      gradient.addColorStop(1, getRGB(this.rgb, 0.5));
      this.ctx.fillStyle = gradient;
      this.ctx.fill();
    };
  }
}
const generateSolarSytem = ({
  planets,
  sunScale,
  scale,
  rotationSpeed,
  distance,
  ctx
}) => {
  const sun = new Sun({
    ctx,
    width: 3.8 * 0.5 * sunScale,
    distance: distance / 2,
    startAngle: 0,
    speed: 33e-4 * rotationSpeed,
    rgb: parseColor("rgb(208,141,16)")
  });
  const earth = new Planet({
    ctx,
    width: 0.96 * 0.5 * scale,
    distance: 10 * 0.5 * scale,
    speed: 0.01 * rotationSpeed,
    rgb: parseColor("rgb(19,102,150)"),
    origin: sun
  });
  return [
    sun,
    new Planet({
      ctx,
      width: 0.3 * 0.5 * scale,
      distance: 4.2,
      speed: 0.017 * rotationSpeed,
      rgb: parseColor("rgb(180, 144, 88)"),
      origin: sun
    }),
    earth,
    new Planet({
      ctx,
      width: 0.24 * 0.5 * scale,
      distance: 3.2 * 0.5 * scale,
      speed: 0.0212 * rotationSpeed,
      rgb: parseColor("rgb(200, 200, 200)"),
      origin: earth
    }),
    new Planet({
      ctx,
      width: 0.64 * 0.5 * scale,
      distance: 12.8 * 0.5 * scale,
      speed: 66e-4 * rotationSpeed,
      rgb: parseColor("rgb(233, 88, 26)"),
      origin: sun
    }),
    new Planet({
      ctx,
      width: 1.44 * 0.5 * scale,
      distance: 17.6 * 0.5 * scale,
      speed: 46e-4 * rotationSpeed,
      rgb: parseColor("rgb(169, 109, 45)"),
      origin: sun
    }),
    new Planet({
      ctx,
      width: 1.2 * 0.5 * scale,
      distance: 22 * 0.5 * scale,
      speed: 4e-3 * rotationSpeed,
      rgb: parseColor("rgb(164,127,84)"),
      origin: sun
    }),
    new Planet({
      ctx,
      width: 0.76 * 0.5 * scale,
      distance: 25.2 * 0.5 * scale,
      speed: 37e-4 * rotationSpeed,
      rgb: parseColor("rgb(84,149,164)"),
      origin: sun
    }),
    new Planet({
      ctx,
      width: 0.62 * 0.5 * scale,
      distance: 27.2 * 0.5 * scale,
      speed: 33e-4 * rotationSpeed,
      rgb: parseColor("rgb(36,82,154)"),
      origin: sun
    })
  ];
};
const FPS = 40;
const SPEED = 115;
class Comet extends Drawable {
  constructor({
    ctx,
    frequence
  }) {
    super({ ctx });
    this.speed = SPEED;
    this.x = 0;
    this.y = 0;
    this.opacity = 0;
    this.draw = () => {
      this.move();
      if (!this.showConfig)
        return;
      this.ctx.save();
      this.ctx.ellipse(this.x, this.y, this.showConfig.width, 90, this.showConfig.direction + Math.PI / 2, 0, Math.PI * 2);
      this.ctx.globalAlpha = this.opacity;
      const gradiant = this.ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 90);
      gradiant.addColorStop(0, getRGB(this.showConfig.rgb, 1));
      gradiant.addColorStop(1, getRGB(this.showConfig.rgb, 0));
      this.ctx.fillStyle = gradiant;
      this.ctx.fill();
      this.ctx.restore();
    };
    this.ctx = ctx;
    this.frequence = frequence;
  }
  move() {
    if (this.showConfig) {
      this.x += this.speed * Math.cos(this.showConfig.direction);
      this.y += this.speed * Math.sin(this.showConfig.direction);
      const { x: startX, y: startY } = this.showConfig.startCoords;
      const distance = Math.sqrt(Math.pow(this.x - startX, 2) + Math.pow(this.y - startY, 2));
      const showAvancement = distance / this.showConfig.distanceToTarget;
      this.opacity = Math.max(0.7, Math.min(showAvancement < 0.3 ? showAvancement : 1 - showAvancement, 1));
      if (distance > this.showConfig.distanceToTarget) {
        this.showConfig = void 0;
      }
      return;
    }
    const shouldCreateANewShow = Math.random() > 1 - this.frequence / 100 / FPS;
    if (shouldCreateANewShow) {
      const fromAngle = Random.between(0, 2 * Math.PI);
      const maxSideSize = Math.max(this.getCanvasHeight(), this.getCanvasWidth());
      this.showConfig = {
        startCoords: {
          x: Random.around(Math.cos(fromAngle) * maxSideSize / 3, 0.5, "%") + this.getCanvasWidth() / 2,
          y: Random.around(Math.sin(fromAngle) * maxSideSize / 3, 0.5, "%") + this.getCanvasHeight() / 2
        },
        direction: Random.between(fromAngle + Math.PI - Math.PI / 6, fromAngle + Math.PI + Math.PI / 6),
        distanceToTarget: Random.around(maxSideSize * 0.6, 0.3),
        speed: Random.around(SPEED, 0.15, "%"),
        rgb: parseColor("rgb(255,207,207)"),
        width: Random.between(0.2, 0.8),
        startOpacity: 0
      };
      this.x = this.showConfig.startCoords.x;
      this.y = this.showConfig.startCoords.y;
    }
  }
}
const generateComet = ({
  ctx,
  frequence
}) => {
  return new Array(1).fill(0).flatMap(() => {
    return [new Comet({ ctx, frequence })];
  });
};
const INTENSITY_MULTIPLE = 0.025;
const ITERATION_PER_COLOR = 3;
const COLORS = ["rgb(6,2,122)", "rgb(6,66,18)", "#57046e"];
class NebulaColoration extends Drawable {
  constructor({
    ctx,
    intensity
  }) {
    super({ ctx });
    this.draw = () => {
      const imageData = this.ctx.getImageData(0, 0, this.getCanvasWidth(), this.getCanvasHeight());
      const canvasWidth = this.getCanvasWidth();
      const data = Array.from(imageData.data);
      for (let i = 0; i < data.length; i = i + 4) {
        const pixelIndex = i / 4;
        const x = pixelIndex % canvasWidth;
        const y = Math.floor(pixelIndex / canvasWidth);
        this.colorations.forEach((coloration) => {
          const opacity = getColorationOpacity(coloration, x, y) * this.intensity;
          if (opacity > 0) {
            for (let channel = 0; channel < 3; channel++) {
              data[i + channel] = opacity * coloration.rgb[channel] + data[channel + i] * (1 - opacity);
            }
          }
        });
        for (let channel = 0; channel < 3; channel++) {
          const value = data[i + channel];
          if (value > 0) {
            data[i + channel] = Math.round(value - 1 + Math.random());
          }
        }
      }
      imageData.data.set(data);
      this.ctx.putImageData(imageData, 0, 0);
    };
    this.intensity = intensity * INTENSITY_MULTIPLE;
    const grid = getGrid(COLORS.length * ITERATION_PER_COLOR);
    this.colorations = COLORS.flatMap((color) => {
      return new Array(ITERATION_PER_COLOR).fill(0).map(() => {
        const gridItem = grid.pop();
        return {
          coords: {
            x: gridItem.x * this.getCanvasWidth(),
            y: gridItem.y * this.getCanvasHeight()
          },
          rgb: parseColor(color),
          ratio: Random.around(Math.PI / 4, 0.2),
          width: Random.between(5, 8) * this.canvasMinSide * 0.08
        };
      });
    });
  }
  setIntensity(intensity) {
    this.intensity = intensity * INTENSITY_MULTIPLE;
  }
}
const getGrid = (length) => {
  const startAngle = Math.PI * 2 * Math.random();
  const coords = new Array(length).fill(0).map((v, i) => {
    const angle = startAngle + Random.around(i * Math.PI * 2 / length, 0.32);
    const rayon = Random.between(0.8, 1.1);
    return {
      x: (Math.cos(angle) * rayon + 1) / 2,
      y: (Math.sin(angle) * rayon + 1) / 2
    };
  });
  return Random.randomizeArray(coords);
};
const getColorationOpacity = (coloration, x, y) => {
  const xDistance = x - coloration.coords.x;
  const yDistance = y - coloration.coords.y;
  const distanceToNebula = Math.sqrt(Math.pow(xDistance * Math.cos(coloration.ratio), 2) + Math.pow(yDistance * Math.sin(coloration.ratio), 2));
  const relativeDistanceToNebula = (coloration.width - distanceToNebula) / coloration.width;
  return Math.max(relativeDistanceToNebula, 0);
};
const generateNebulaColoration = ({
  ctx,
  coloration,
  intensity
}) => {
  if (coloration) {
    coloration.setIntensity(intensity);
    return coloration;
  }
  return new NebulaColoration({
    ctx,
    intensity
  });
};
const CANVAS_STYLE = "width: 100%;height: 100%;position:absolute;will-change:transform;top: 0;left:0;";
class Nebula {
  constructor({
    config,
    element
  }) {
    this.cancelAnimations = [];
    this.stars = [];
    this.comets = [];
    this.planets = [];
    this.onResize = () => {
      this.styleCanvas();
      this.init();
    };
    this.styleCanvas = () => {
      this.bgCanvas.setAttribute("style", CANVAS_STYLE);
      this.bgCanvas.width = this.element.offsetWidth / 3;
      this.bgCanvas.height = this.element.offsetHeight / 3;
      this.canvas.setAttribute("style", CANVAS_STYLE);
      this.canvas.width = this.element.offsetWidth * 2;
      this.canvas.height = this.element.offsetHeight * 2;
    };
    this.element = element;
    this.bgCanvas = document.createElement("CANVAS");
    this.canvas = document.createElement("CANVAS");
    element.append(this.bgCanvas);
    element.append(this.canvas);
    this.styleCanvas();
    window.addEventListener("resize", this.onResize);
    this.config = fillConfig(config);
    this.setConfig(config);
  }
  setConfig(config) {
    this.config = fillConfig(config);
    this.coloration = generateNebulaColoration({
      coloration: this.coloration,
      ctx: this.bgCanvas.getContext("2d"),
      intensity: this.config.nebulasIntensity
    });
    this.stars = generateStars({
      stars: this.stars,
      ctx: this.canvas.getContext("2d"),
      color: this.config.starsColor,
      count: this.config.starsCount,
      rotationSpeed: this.config.starsRotationSpeed
    });
    this.planets = generateSolarSytem({
      planets: this.planets,
      sunScale: this.config.sunScale,
      scale: this.config.planetsScale,
      ctx: this.canvas.getContext("2d"),
      rotationSpeed: this.config.solarSystemSpeedOrbit,
      distance: this.config.solarSystemOrbite
    });
    this.comets = generateComet({
      ctx: this.canvas.getContext("2d"),
      frequence: this.config.cometFrequence
    });
    this.init();
  }
  init() {
    this.draw();
  }
  draw() {
    this.cancelAnimations.forEach((callback) => callback());
    this.cancelAnimations = [
      drawOnCanvas({
        canvas: this.bgCanvas,
        drawings: [this.coloration],
        bgColor: this.config.bgColor
      }),
      drawOnCanvas({
        canvas: this.canvas,
        drawings: [...this.stars, ...this.comets, ...this.planets],
        fps: FPS
      })
    ];
  }
  destroy() {
    var _a, _b;
    window.removeEventListener("resize", this.onResize);
    this.cancelAnimations.forEach((callback) => callback());
    this.cancelAnimations = [];
    (_a = this.bgCanvas.parentElement) == null ? void 0 : _a.removeChild(this.bgCanvas);
    (_b = this.canvas.parentElement) == null ? void 0 : _b.removeChild(this.canvas);
  }
}
const ReactNebula = ({ config = {} }) => {
  const nebulaRef = useRef();
  const wrapperRef = useRef(null);
  useLayoutEffect(() => {
    var _a;
    if (nebulaRef.current) {
      (_a = nebulaRef.current) == null ? void 0 : _a.setConfig(config);
    }
  }, [config]);
  useLayoutEffect(() => {
    if (!nebulaRef.current) {
      nebulaRef.current = new Nebula({
        config,
        element: wrapperRef.current
      });
    }
    return () => {
      var _a;
      (_a = nebulaRef.current) == null ? void 0 : _a.destroy();
      nebulaRef.current = void 0;
    };
  }, []);
  return /* @__PURE__ */ React.createElement("div", {
    ref: wrapperRef,
    style: {
      overflow: "hidden",
      background: "#0a1929",
      height: "100%",
      width: "100%",
      position: "absolute"
    }
  });
};
const createNebula = (element, config) => {
  return new Nebula({ config, element });
};
export { Nebula, ReactNebula, createNebula };
