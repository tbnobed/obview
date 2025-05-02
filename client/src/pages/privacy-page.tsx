import { Link } from "wouter";
import PageLayout from "@/components/layout/page-layout";

export default function PrivacyPage() {
  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="prose lg:prose-xl mx-auto">
          <h1 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-primary-500 to-primary-700 bg-clip-text text-transparent">Privacy Policy</h1>
          
          <section className="mb-8">
            <p className="text-sm text-gray-500 mb-6">Last Updated: May 2, 2025</p>
            
            <p className="mb-4">
              At Obviu.io, we take your privacy seriously. This Privacy Policy explains how we collect, 
              use, disclose, and safeguard your information when you use our platform.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Information We Collect</h2>
            <p className="mb-4">We collect information that you provide directly to us, including:</p>
            <ul>
              <li>Account information (name, email address, password)</li>
              <li>Profile information (profile picture, job title)</li>
              <li>Content you upload (media files, comments, feedback)</li>
              <li>Communications with other users</li>
            </ul>
          </section>
          
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">How We Use Your Information</h2>
            <p className="mb-4">We use the information we collect to:</p>
            <ul>
              <li>Provide, maintain, and improve our services</li>
              <li>Process and complete transactions</li>
              <li>Send you technical notices, updates, and administrative messages</li>
              <li>Respond to your comments, questions, and requests</li>
              <li>Monitor and analyze trends, usage, and activities</li>
              <li>Detect, investigate, and prevent fraudulent transactions and other illegal activities</li>
              <li>Personalize and improve the services</li>
            </ul>
          </section>
          
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Data Security</h2>
            <p>
              We have implemented appropriate technical and organizational security measures designed to 
              protect the security of any personal information we process. However, please also remember 
              that we cannot guarantee that the internet itself is 100% secure.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Your Rights</h2>
            <p className="mb-4">You have certain rights regarding your personal information, including:</p>
            <ul>
              <li>Access to your personal information</li>
              <li>Correction of inaccurate or incomplete information</li>
              <li>Deletion of your personal information</li>
              <li>Restriction of processing of your personal information</li>
              <li>Data portability</li>
            </ul>
          </section>
          
          <section className="text-center mt-12">
            <Link href="/">
              <button className="bg-primary-500 hover:bg-primary-600 text-white font-semibold py-2 px-6 rounded-md transition-colors">
                Back to Home
              </button>
            </Link>
          </section>
        </div>
      </div>
    </PageLayout>
  );
}