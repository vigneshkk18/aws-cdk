#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { TestAuthReactAppStack } from "../lib/test-auth-react-app-stack";
import { config } from "dotenv";
import { TestAuthBaseStack } from "../lib/test-auth-base-stack";

config();

const app = new cdk.App();

new TestAuthBaseStack(app, "TestAuthBaseStack");

new TestAuthReactAppStack(app, "TestAuthReactAppStack", {
  githubRepo: process.env.GithubRepo!,
  githubBranch: process.env.GithubBranch!,
  githubOwner: process.env.GithubOwner!,
  githubConnectionArn: process.env.GithubConnectionARN!,
});
