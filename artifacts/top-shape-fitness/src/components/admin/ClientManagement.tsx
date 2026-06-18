import { useState } from "react";
import ClientList from "./ClientList";
import ClientDetail from "./ClientDetail";
import AddClientForm from "./AddClientForm";
import PackageSection from "./PackageSection";

export type ClientView =
  | { name: "list" }
  | { name: "detail"; clientId: string }
  | { name: "add" }
  | { name: "packages" };

export default function ClientManagement() {
  const [view, setView] = useState<ClientView>({ name: "list" });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Breadcrumb nav */}
      <div className="px-4 md:px-6 py-3 border-b border-gray-100 bg-white flex items-center gap-2 text-sm flex-wrap">
        <button
          onClick={() => setView({ name: "list" })}
          className={`font-medium transition ${
            view.name === "list"
              ? "text-[#2A255D]"
              : "text-gray-400 hover:text-[#2A255D]"
          }`}
        >
          Clients
        </button>
        {view.name !== "list" && view.name !== "packages" && (
          <>
            <span className="text-gray-300">/</span>
            <span className="text-[#2A255D] font-medium capitalize">
              {view.name === "add" ? "New Client" : "Client Detail"}
            </span>
          </>
        )}
        {view.name === "packages" && (
          <>
            <span className="text-gray-300">/</span>
            <span className="text-[#2A255D] font-medium">Packages</span>
          </>
        )}

        {/* Tab pills */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setView({ name: "list" })}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              view.name === "list" || view.name === "detail" || view.name === "add"
                ? "bg-[#2A255D] text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            Clients
          </button>
          <button
            onClick={() => setView({ name: "packages" })}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              view.name === "packages"
                ? "bg-[#2A255D] text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            Packages
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {view.name === "list" && (
          <ClientList
            onView={(id) => setView({ name: "detail", clientId: id })}
            onAdd={() => setView({ name: "add" })}
          />
        )}
        {view.name === "detail" && (
          <ClientDetail
            clientId={view.clientId}
            onBack={() => setView({ name: "list" })}
          />
        )}
        {view.name === "add" && (
          <AddClientForm
            onCancel={() => setView({ name: "list" })}
            onSuccess={(clientId) => setView({ name: "detail", clientId })}
          />
        )}
        {view.name === "packages" && <PackageSection />}
      </div>
    </div>
  );
}
