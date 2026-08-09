export default function StripeSuccessPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-bold text-green-700 mb-4">
        Configuration Stripe terminée !
      </h1>
      <p className="text-gray-600">
        Votre compte est maintenant prêt à recevoir des paiements.
      </p>
      <a href="/merchant/profile" className="mt-4 text-green-700 underline">
        Retour à mon profil
      </a>
    </main>
  );
}