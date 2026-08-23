import { spawn } from 'child_process';

const child = spawn('npx.cmd', ['shadcn@latest', 'init', '-y', '-t', 'vite', '-b', 'radix'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

child.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(output);
  if (output.includes('Which preset would you like to use?')) {
    // Select Custom (which is the last option, usually requires arrow down)
    // Actually, sending 'Custom' might not work. Sending down arrow 8 times.
    child.stdin.write('\x1B[B\x1B[B\x1B[B\x1B[B\x1B[B\x1B[B\x1B[B\x1B[B\r');
  } else if (output.includes('Which style would you like to use?')) {
    // New York is usually first or default in Custom
    // If New York is first, just send enter.
    child.stdin.write('\r');
  } else if (output.includes('Which color would you like to use as base color?')) {
    // Zinc is usually first or default.
    child.stdin.write('\r');
  } else if (output.includes('Would you like to use CSS variables?')) {
    child.stdin.write('y\r');
  }
});

child.stderr.on('data', (data) => {
  console.error(data.toString());
});

child.on('close', (code) => {
  console.log(`Child process exited with code ${code}`);
});
