import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { readFileSync } from "node:fs";
import path from "node:path";

const s3 = cdk.aws_s3,
  iam = cdk.aws_iam,
  codebuild = cdk.aws_codebuild,
  codepipeline = cdk.aws_codepipeline,
  codepipelineActions = cdk.aws_codepipeline_actions,
  cloudfront = cdk.aws_cloudfront,
  cloudfrontOrigins = cdk.aws_cloudfront_origins,
  lambda = cdk.aws_lambda;

interface Props extends cdk.StackProps {
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  githubConnectionArn: string;
}

export class TestAuthReactAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const websiteBucket = new s3.Bucket(this, "WebsiteBucket", {
      bucketName: "test-auth-react-app",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const artifactBucket = new s3.Bucket(this, "ArtifactBucket", {
      bucketName: "test-auth-react-app-artifacts",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const codeBuildRole = new iam.Role(this, "CodeBuildRole", {
      roleName: "CodeBuildRole",
      assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyName(
          this,
          "CodeBuildServiceRolePolicy",
          "CodeBuildServiceRolePolicy"
        ),
      ],
    });

    const codePipelineRole = new iam.Role(this, "CodePipelineRole", {
      roleName: "CodePipelineRole",
      assumedBy: new iam.ServicePrincipal("codepipeline.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyName(
          this,
          "CodePipelineServiceRolePolicy",
          "CodePipelineServiceRolePolicy"
        ),
      ],
    });

    const codeBuild = new codebuild.PipelineProject(
      this,
      "TestAuthReactAppBuild",
      {
        projectName: "TestAuthReactAppBuild",
        role: codeBuildRole,
        buildSpec: codebuild.BuildSpec.fromSourceFilename("Buildspec.yml"),
        environment: {
          computeType: codebuild.ComputeType.SMALL,
          environmentVariables: {
            VITE_AWS_USER_POOL_ID: { value: process.env.UserPoolId },
            VITE_AWS_USER_POOL_CLIENT_ID: {
              value: process.env.UserPoolClientId,
            },
          },
        },
      }
    );

    const distribution = new cloudfront.Distribution(
      this,
      "TestReactAppDistribution",
      {
        defaultBehavior: {
          origin:
            cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(
              websiteBucket
            ),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        defaultRootObject: "index.html",
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
          },
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
          },
        ],
      }
    );

    const invalidationLambda = new lambda.Function(
      this,
      "CloudFrontInvalidationLambda",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "index.handler",
        code: lambda.Code.fromInline(
          readFileSync(
            path.join(
              __dirname,
              "./helpers/test-auth-react-app-stack/cacheInvalidation.js"
            ),
            "utf-8"
          )
        ),
        environment: {
          CLOUDFRONT_DISTRIBUTION_ID: distribution.distributionId,
        },
        timeout: cdk.Duration.minutes(1),
      }
    );

    // Grant the Lambda function permissions to invalidate the cache
    invalidationLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "cloudfront:CreateInvalidation",
          "codepipeline:PutJobFailureResult",
          "codepipeline:PutJobSuccessResult",
        ],
        resources: ["*"],
      })
    );

    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact();

    new codepipeline.Pipeline(this, "TestAuthReactPipeline", {
      pipelineName: "TestAuthReactAppPipeline",
      role: codePipelineRole,
      pipelineType: codepipeline.PipelineType.V2,
      executionMode: codepipeline.ExecutionMode.SUPERSEDED,
      artifactBucket: artifactBucket,
      stages: [
        {
          stageName: "Source",
          actions: [
            new codepipelineActions.CodeStarConnectionsSourceAction({
              actionName: "GitHub_Source",
              owner: props!.githubOwner,
              repo: props!.githubRepo,
              branch: props!.githubBranch,
              output: sourceOutput,
              connectionArn: props!.githubConnectionArn,
            }),
          ],
        },
        {
          stageName: "Build",
          actions: [
            new codepipelineActions.CodeBuildAction({
              actionName: "CodeBuild",
              project: codeBuild,
              input: sourceOutput,
              outputs: [buildOutput],
            }),
          ],
        },
        {
          stageName: "Deploy",
          actions: [
            new codepipelineActions.S3DeployAction({
              actionName: "DeployToS3",
              bucket: websiteBucket,
              input: buildOutput,
              extract: true,
            }),
          ],
        },
        {
          stageName: "InvalidateCDNCache",
          actions: [
            new codepipelineActions.LambdaInvokeAction({
              actionName: "CDNCacheBurst",
              lambda: invalidationLambda,
            }),
          ],
        },
      ],
    });
  }
}
