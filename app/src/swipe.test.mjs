import test from 'node:test';
import assert from 'node:assert/strict';
import {swipeDecision,swipeExitDistance} from './swipe.ts';

test('short drags and taps do not produce a preference',()=>{
  assert.equal(swipeDecision(0,386,0),null);
  assert.equal(swipeDecision(50,386,.1),null);
  assert.equal(swipeDecision(-30,386,-2),null);
});
test('released cards commit in the actual drag direction',()=>{
  assert.equal(swipeDecision(110,386,.1),'like');
  assert.equal(swipeDecision(-110,386,-.1),'pass');
  assert.equal(swipeDecision(50,386,.8),'like');
  assert.equal(swipeDecision(-50,386,-.8),'pass');
  assert.equal(swipeDecision(50,386,-.8),null);
});
test('exit clears the whole viewport rather than fading in place',()=>{
  assert.ok(swipeExitDistance(430,386)-386/2>430);
});
