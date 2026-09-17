import { add } from '../src/placeholder.ts';

Deno.test('add combines two numbers', () => {
  if (add(2, 3) !== 5) {
    throw new Error('Expected add(2, 3) to equal 5');
  }
});
