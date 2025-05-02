import { Link } from "wouter";
import PageLayout from "@/components/layout/page-layout";

export default function TermsPage() {
  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="prose lg:prose-xl dark:prose-invert prose-p:dark:text-gray-200 prose-li:dark:text-gray-200 mx-auto">
          <h1 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-primary-500 to-primary-700 bg-clip-text text-transparent">Terms of Service</h1>
          
          <section className="mb-8">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Last Updated: May 2, 2025</p>
            
            <p className="mb-4">
              Please read these Terms of Service carefully before using Obviu.io. Your access to and use
              of the service is conditioned on your acceptance of and compliance with these Terms.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p>
              By accessing or using our service, you agree to be bound by these Terms. If you disagree
              with any part of the terms, then you may not access the service.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. User Accounts</h2>
            <p className="mb-4">
              When you create an account with us, you must provide information that is accurate, complete, and
              current at all times. Failure to do so constitutes a breach of the Terms, which may result in
              immediate termination of your account on our service.
            </p>
            <p>
              You are responsible for safeguarding the password that you use to access the service and for any
              activities or actions under your password.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. Content</h2>
            <p className="mb-4">
              Our service allows you to post, link, store, share and otherwise make available certain information,
              text, graphics, videos, or other material. You are responsible for the content that you post on or
              through the service, including its legality, reliability, and appropriateness.
            </p>
            <p>
              By posting content on or through the service, you represent and warrant that you own the content
              or have the right to use it and grant us the rights and license as provided in these Terms.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Intellectual Property</h2>
            <p>
              The service and its original content (excluding content provided by users), features, and
              functionality are and will remain the exclusive property of Obviu.io and its licensors.
              The service is protected by copyright, trademark, and other laws of both the United States
              and foreign countries.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. Termination</h2>
            <p>
              We may terminate or suspend your account immediately, without prior notice or liability, for
              any reason whatsoever, including without limitation if you breach the Terms. Upon termination,
              your right to use the service will immediately cease.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Limitation of Liability</h2>
            <p>
              In no event shall Obviu.io, nor its directors, employees, partners, agents, suppliers, or
              affiliates, be liable for any indirect, incidental, special, consequential or punitive damages,
              including without limitation, loss of profits, data, use, goodwill, or other intangible losses,
              resulting from your access to or use of or inability to access or use the service.
            </p>
          </section>
          
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Changes</h2>
            <p>
              We reserve the right, at our sole discretion, to modify or replace these Terms at any time. By
              continuing to access or use our service after those revisions become effective, you agree to be
              bound by the revised terms.
            </p>
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