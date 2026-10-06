// ============================================================================
// knockables.js — saker bilen kan köra över: de välter eller gungar till.
// ============================================================================
// collision.js säger till (obstacle.onHit) när bilen kör genom ett mjukt hinder. Här
// finns det som då händer med själva föremålet. Tre sorter:
//   knockableObject   – ett vanligt objekt (en vägskylt) som välter runt foten och ligger kvar.
//   knockableInstances – delar i InstancedMesh (lyktor, träd) som välter runt foten och ligger kvar.
//   wobbler           – ett objekt som gungar till och lugnar sig igen (skärmen på en skyltstolpe).
// Välten tar FALL_TIME sekunder. Det som ligger nere ligger kvar tills sidan laddas om.
import * as THREE from 'three';

const FALL_TIME = 0.45;          // Sekunder tills det ligger ner.
const WOBBLE_TIME = 1.1;         // Sekunder som en gungning håller på.
const WOBBLE_AMOUNT = 0.07;      // Största lutning (radianer) vid en full träff.

const running = []; // Pågående animationer: { update(delta) → true när klar }.

// Körs en gång per bild (main.js).
export function updateKnockables(delta) {
  for (let i = running.length - 1; i >= 0; i--) {
    if (running[i].update(delta)) running.splice(i, 1);
  }
}

// Fallkurvan 0–1: långsam start, snabb slut, lite studs på slutet.
function fallCurve(u) {
  if (u >= 1) return 1;
  return u * u;
}

const up = new THREE.Vector3(0, 1, 0);
const axis = new THREE.Vector3();
const spin = new THREE.Quaternion();
const matrixA = new THREE.Matrix4();
const matrixB = new THREE.Matrix4();
const matrixC = new THREE.Matrix4();

// Rotationsaxeln som får "uppåt" att luta bort i färdriktningen (dirX, dirZ).
function fallAxis(dirX, dirZ) {
  return axis.set(dirX, 0, dirZ).cross(up).negate().normalize(); // up × dir
}

// Ett objekt (t.ex. en grupp med foten i origo) som välter runt sin fot.
// Returnerar knock(dirX, dirZ, strength). Objektet ska vara markMoving.
export function knockableObject(object) {
  const baseQuaternion = object.quaternion.clone();
  let started = false;
  return function knock(dirX, dirZ) {
    if (started) return;
    started = true;
    const fallAxisNow = fallAxis(dirX, dirZ).clone();
    const target = (1.45 + Math.random() * 0.15); // Ca 83–92 grader.
    let time = 0;
    running.push({
      update(delta) {
        time += delta;
        const u = Math.min(1, time / FALL_TIME);
        spin.setFromAxisAngle(fallAxisNow, target * fallCurve(u));
        object.quaternion.copy(spin).multiply(baseQuaternion);
        return u >= 1;
      },
    });
  };
}

// Delar i InstancedMesh som välter runt foten (pivot = { x, z }) tillsammans.
// parts = [{ mesh, index }]. onKnock() körs när det börjar (t.ex. släck ljuset).
export function knockableInstances(pivot, parts, onKnock, tilt = 1.45) {
  let started = false;
  return function knock(dirX, dirZ) {
    if (started) return;
    started = true;
    if (onKnock) onKnock();
    const originals = parts.map((part) => {
      const original = new THREE.Matrix4();
      part.mesh.getMatrixAt(part.index, original);
      return original;
    });
    const fallAxisNow = fallAxis(dirX, dirZ).clone();
    const target = tilt + Math.random() * 0.15;
    let time = 0;
    running.push({
      update(delta) {
        time += delta;
        const u = Math.min(1, time / FALL_TIME);
        spin.setFromAxisAngle(fallAxisNow, target * fallCurve(u));
        // ny = flytta tillbaka · vrid · flytta till origo · gammal
        matrixA.makeTranslation(pivot.x, 0, pivot.z);
        matrixB.makeRotationFromQuaternion(spin);
        matrixC.makeTranslation(-pivot.x, 0, -pivot.z);
        matrixA.multiply(matrixB).multiply(matrixC);
        parts.forEach((part, i) => {
          matrixB.multiplyMatrices(matrixA, originals[i]);
          part.mesh.setMatrixAt(part.index, matrixB);
          part.mesh.instanceMatrix.needsUpdate = true;
        });
        return u >= 1;
      },
    });
  };
}

// Ett objekt som gungar till (lutar fram och tillbaka, dör ut). Ändrar bara rotation.x
// och rotation.z, så objektet får inte ha något annat som styr dem. Kan träffas igen.
export function wobbler(object) {
  const baseX = object.rotation.x;
  const baseZ = object.rotation.z;
  let current = null;
  return function knock(dirX, dirZ, strength = 1) {
    if (current) running.splice(running.indexOf(current), 1);
    let time = 0;
    const amount = WOBBLE_AMOUNT * (0.4 + 0.6 * strength);
    current = {
      update(delta) {
        time += delta;
        const u = Math.min(1, time / WOBBLE_TIME);
        const wave = Math.sin(u * Math.PI * 5) * Math.pow(1 - u, 2) * amount;
        object.rotation.x = baseX + wave;
        object.rotation.z = baseZ + wave * 0.5 * Math.sign(dirX || 1);
        if (u >= 1) {
          object.rotation.x = baseX;
          object.rotation.z = baseZ;
          current = null;
          return true;
        }
        return false;
      },
    };
    running.push(current);
  };
}
