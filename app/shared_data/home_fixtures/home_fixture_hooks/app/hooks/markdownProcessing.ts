/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

function markdownProcessingPage(siteSlug: string, mdContent: string): string {
  mdContent = addBreaksAroundSpecialLines(mdContent);
  mdContent = turnVideoTimestampsIntoLinks(mdContent);
  return mdContent;
}

function markdownProcessingBacklinks(siteSlug: string, mdContent: string): string {
  mdContent = addBreaksAroundSpecialLines(mdContent);
  return mdContent;
}

function addBreaksAroundSpecialLines(mdContent: string): string {
  const inlineSpecialLines = ['...', '......', '==='];
  const lines = mdContent.split('\n');
  const modifiedLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    if (trimmedLine === ':') {
      // For ":", just add a blank line (paragraph break) and remove the colon
      if (modifiedLines.length > 0 && modifiedLines[modifiedLines.length - 1] !== '') {
        modifiedLines.push('');
      }
    } else if (inlineSpecialLines.includes(trimmedLine)) {
      // Append <br> to previous line to create a line break before the special line
      if (modifiedLines.length > 0) {
        const lastLine = modifiedLines[modifiedLines.length - 1];
        if (lastLine.trim() !== '' && !lastLine.endsWith('<br>')) {
          modifiedLines[modifiedLines.length - 1] = lastLine + '<br>';
        }
      }
      // Add the special line with <br> at the end
      modifiedLines.push(line + '<br>');
    } else {
      modifiedLines.push(line);
    }
  }
  
  return modifiedLines.join('\n');
}

function turnVideoTimestampsIntoLinks(mdContent: string): string {
  const lines = mdContent.split('\n');
  if (lines.length === 0) {
    return mdContent;
  }

  const youtubeUrl = lines[0].trim();

  if (!youtubeUrl.startsWith('https://www.youtube.com/watch?v=') && 
      !youtubeUrl.startsWith('https://youtu.be/')) {
    return mdContent;
  }

  const replaceTimestamp = (match: string, timestamp: string): string => {
    const parts = timestamp.split(':');
    let totalSeconds: number;

    if (parts.length === 2) {
      const [minutes, seconds] = parts.map(Number);
      totalSeconds = minutes * 60 + seconds;
    } else if (parts.length === 3) {
      const [hours, minutes, seconds] = parts.map(Number);
      totalSeconds = hours * 3600 + minutes * 60 + seconds;
    } else {
      // Invalid timestamp format, return original
      return match;
    }

    return `At [${timestamp}](${youtubeUrl}&t=${totalSeconds}s)`;
  };

  const modifiedLines = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const modifiedLine = line.replace(/At (\d+:\d+(?::\d+)?)/g, replaceTimestamp);
    modifiedLines.push(modifiedLine);
  }

  return modifiedLines.join('\n');
} 


