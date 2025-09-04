import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

const ec2 = cdk.aws_ec2;

export class TestAuthBaseStack extends cdk.Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const vpc = new ec2.Vpc(this, "VPC", {
      vpcName: "TestAuth",
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      createInternetGateway: true,
      subnetConfiguration: [
        {
          name: "TestAuthSPublic1",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "TestAuthSPublic2",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });
  }
}
