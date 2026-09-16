import { describe, expect, test } from 'vitest';

import { type AmbientCloud, CLOUD_IMAGE_PX, CLOUD_PAD_SIGMAS, cloudGeometry, cloudGradient, renderCloudImage } from './ambientClouds';

const cloud: AmbientCloud = { hex: '#8fd3f4', edge: 0.68, blur: 90, vw: 76, opacity: 0.2 };

describe('cloudGeometry', () => {
  test('the box follows the viewport and the pad holds three standard deviations', () => {
    const geometry = cloudGeometry(cloud, 1120);
    expect(geometry.box).toBeCloseTo(851.2);
    expect(geometry.pad).toBe(CLOUD_PAD_SIGMAS * 90);
  });

  test('the canvas covers box plus pad on each side', () => {
    const geometry = cloudGeometry(cloud, 1120);
    expect(geometry.scale * (geometry.box + 2 * geometry.pad)).toBeCloseTo(CLOUD_IMAGE_PX);
  });

  test('the gradient reaches the farthest corner and the blur keeps its ratio to the box', () => {
    const geometry = cloudGeometry(cloud, 1120);
    expect(geometry.radius).toBeCloseTo((geometry.box / Math.SQRT2) * geometry.scale);
    expect(geometry.sigma / geometry.radius).toBeCloseTo(90 / (geometry.box / Math.SQRT2));
  });
});

describe('cloudGradient', () => {
  test('is the canvas gradient, colour to clear at the edge', () => {
    expect(cloudGradient(cloud)).toBe('radial-gradient(circle, #8fd3f4 0%, rgba(143,211,244,0) 68%)');
  });
});

describe('renderCloudImage', () => {
  test('gives nothing where no canvas can draw, so the gradient stands in', () => {
    // jsdom has no 2d context; the component then falls back to cloudGradient.
    expect(renderCloudImage(cloud, 1120)).toBeUndefined();
  });
});
