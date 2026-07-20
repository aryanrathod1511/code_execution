import { LanguageConfig } from '../types';

export const LANGUAGES: Record<string, LanguageConfig> = {
  python: {
    image: 'python:3.10-alpine',
    filename: 'main.py',
    compileCmd: null,
    runCmd: ['python3', '/tmp/main.py']
  },
  cpp: {
    image: 'gcc:12',
    filename: 'main.cpp',
    compileCmd: ['g++', '-O3', '/tmp/main.cpp', '-o', '/tmp/main'],
    runCmd: ['/tmp/main']
  },
  java: {
    image: 'eclipse-temurin:17-alpine',
    filename: 'Main.java',
    compileCmd: ['javac', '/tmp/Main.java'],
    runCmd: ['java', '-cp', '/tmp', 'Main']
  }
};
