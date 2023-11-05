#!/bin/bash

prism proxy --host ::1 --errors openapi.yaml "http://[::1]:3000/"
