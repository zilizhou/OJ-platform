FROM docker.m.daocloud.io/library/python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends time \
 && rm -rf /var/lib/apt/lists/*
