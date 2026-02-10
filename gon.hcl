source = ["./dist/review-for-agent_darwin_arm64_v8.0/review-for-agent"]

bundle_id = "com.waraq-labs.review-for-agent"

apple_id {
  username = "@env:AC_USERNAME"
  password = "@env:AC_PASSWORD"
  provider = "@env:AC_TEAM_ID"
}

sign {
  application_identity = "Developer ID Application"
}

zip {
  output_path = "./dist/review-for-agent_darwin_arm64.zip"
}
