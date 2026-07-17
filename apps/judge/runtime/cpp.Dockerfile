FROM docker.m.daocloud.io/library/gcc:13
RUN apt-get update \
 && apt-get install -y --no-install-recommends time \
 && rm -rf /var/lib/apt/lists/*
