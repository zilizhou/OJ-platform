export interface LanguageSpec {
  image: string;
  sourceFile: string;
  compile?: string;       // 编译命令(容器内,工作目录 /work)
  run: string;            // 运行命令
  extraRunArgs?: string[]; // 例如 jvm 选项
}

export const LANGUAGES: Record<string, LanguageSpec> = {
  cpp: {
    // oj-cpp:13 = gcc:13 + /usr/bin/time;判题镜像在服务器上预先 build
    image: 'oj-cpp:13',
    sourceFile: 'main.cpp',
    compile: 'g++ -O2 -std=c++17 -o main main.cpp 2> compile.err',
    run: './main',
  },
  python: {
    image: 'oj-python:3.12',
    sourceFile: 'main.py',
    run: 'python3 main.py',
  },
  java: {
    image: 'eclipse-temurin:21-jdk-alpine',
    sourceFile: 'Main.java',
    compile: 'javac Main.java 2> compile.err',
    run: 'java -XX:+UseSerialGC -Xss64m -Xmx256m Main',
  },
  javascript: {
    image: 'node:20-alpine',
    sourceFile: 'main.js',
    run: 'node main.js',
  },
};

// SPJ 编译规约 —— 仅支持 C++ 作为校验器
export const SPJ_LANG: LanguageSpec = {
  image: 'oj-cpp:13',
  sourceFile: 'spj.cpp',
  compile: 'g++ -O2 -std=c++17 -o spj spj.cpp 2> spj_compile.err',
  run: './spj',
};
