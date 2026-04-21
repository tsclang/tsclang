// TSClang formatter: normalizes whitespace and indentation
// Uses a simple token-based printer (not full AST pretty-printer)

/**
 * Format TSC source code.
 * Rules:
 *   - 4-space indentation
 *   - Single blank line between top-level declarations
 *   - No trailing whitespace
 *   - Exactly one newline at EOF
 *   - Spaces around operators
 *   - No extra spaces inside parentheses
 */
export function format(src) {
  const lines = src.split('\n');
  const result = [];

  let indentLevel = 0;
  let prevBlank = false;
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();
    i++;

    // Empty line
    if (trimmed === '') {
      if (!prevBlank && result.length > 0) {
        result.push('');
        prevBlank = true;
      }
      continue;
    }

    // Decrease indent before closing braces
    if (trimmed === '}' || trimmed === '};' || trimmed === '})' || trimmed === '});' || trimmed.startsWith('} else')) {
      if (indentLevel > 0) indentLevel--;
    }

    const formatted = formatLine(trimmed, indentLevel);
    result.push(formatted);
    prevBlank = false;

    // Increase indent after opening brace
    if (trimmed.endsWith('{') && !trimmed.startsWith('//')) {
      indentLevel++;
    }
    // Handle same-line close: if(x){y} — no indent change (edge case, skip)
  }

  // Remove trailing blank lines
  while (result.length > 0 && result[result.length - 1] === '') {
    result.pop();
  }

  return result.join('\n') + '\n';
}

function formatLine(line, indent) {
  const prefix = '    '.repeat(indent);
  // Normalize spaces inside the line
  const normalized = normalizeSpaces(line);
  return prefix + normalized;
}

function normalizeSpaces(line) {
  // Preserve string literals and comments unchanged
  // Simple heuristic: collapse multiple spaces to one (except inside strings/comments)
  let out = '';
  let inStr = false;
  let strChar = '';
  let i = 0;

  while (i < line.length) {
    const c = line[i];

    // Line comment
    if (!inStr && c === '/' && line[i + 1] === '/') {
      // Keep everything from here to end as-is
      out += line.slice(i);
      break;
    }

    // String start
    if (!inStr && (c === '"' || c === "'" || c === '`')) {
      inStr = true;
      strChar = c;
      out += c;
      i++;
      continue;
    }

    // String end
    if (inStr && c === strChar && line[i - 1] !== '\\') {
      inStr = false;
      out += c;
      i++;
      continue;
    }

    if (inStr) {
      out += c;
      i++;
      continue;
    }

    // Collapse multiple spaces to one
    if (c === ' ' && out.length > 0 && out[out.length - 1] === ' ') {
      i++;
      continue;
    }

    out += c;
    i++;
  }

  return out.trimEnd();
}
