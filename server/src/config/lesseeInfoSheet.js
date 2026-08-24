// Single config that drives the Lessee (Tenant) form, validation, and PDF.
// Mirrors the official O-Lease "Lessee Information Sheet • Registration" form.
export default {
  title: "Lessee Information Sheet",
  sections: [
    {
      title: "Registration",
      fields: [{ key: "registrationNumber", label: "O-Lease Registration Number", type: "text" }],
    },
    {
      title: "A. Personal Data",
      fields: [
        { key: "lastName", label: "Last Name", type: "text", required: true },
        { key: "firstName", label: "First Name", type: "text", required: true },
        { key: "middleInitial", label: "Middle Initial", type: "text" },
        { key: "suffix", label: "Suffix", type: "text" },
        { key: "birthday", label: "Birthday", type: "date" },
        { key: "sex", label: "Sex", type: "radio", options: ["Male", "Female"] },
        { key: "nationality", label: "Nationality", type: "text" },
        { key: "civilStatus", label: "Civil Status", type: "radio", options: ["Single", "Married"] },
        { key: "homeAddress", label: "Home Address", type: "textarea" },
        { key: "telephone", label: "Telephone Number", type: "tel" },
        { key: "mobile", label: "Mobile Number", type: "tel", required: true },
        { key: "email", label: "Email Address", type: "email", required: true },
        { key: "tin", label: "TIN", type: "text" },
        {
          key: "preferredChannel",
          label: "Preferred Channel",
          type: "checkboxes",
          options: ["SMS", "Call", "Email", "Viber", "Messenger", "WhatsApp"],
          allowOther: true,
        },
      ],
    },
    {
      title: "Details of Spouse",
      fields: [
        { key: "spouseLastName", label: "Last Name", type: "text" },
        { key: "spouseFirstName", label: "First Name", type: "text" },
        { key: "spouseMiddleInitial", label: "Middle Initial", type: "text" },
        { key: "spouseSuffix", label: "Suffix", type: "text" },
      ],
    },
    {
      title: "B. Lease Information",
      fields: [
        {
          key: "estate",
          label: "Estate",
          type: "radio",
          options: ["Capitol Commons", "Circulo Verde", "Greenhills Center", "Ortigas East"],
          required: true,
        },
        { key: "buildingName", label: "Name of Building", type: "text" },
        { key: "unitNumber", label: "Unit Number", type: "text", required: true },
        { key: "floorArea", label: "Floor Area (in sqm)", type: "number" },
        { key: "unitType", label: "Unit Type", type: "radio", options: ["Studio", "1-bedroom"], allowOther: true },
        { key: "unitDressUp", label: "Unit Dress-up", type: "radio", options: ["Bare Unit", "Semi-furnished", "Fully Furnished"] },
        { key: "unitView", label: "Unit View", type: "radio", options: ["Facing Amenities", "Not Facing Amenities"] },
        { key: "petRestriction", label: "Pet Restriction", type: "radio", options: ["With Pet", "No Pet"], allowOther: true, otherLabel: "Others" },
        { key: "unitPaymentStatus", label: "Unit Payment Status", type: "radio", options: ["Full Payment thru Cash", "Post-dated Checks"] },
        { key: "leaseTermPeriod", label: "Lease Term Period", type: "radio", options: ["Medium Term (6 to 11 months)", "Long Term (1 year and above)"] },
        { key: "preferredLeaseRate", label: "Preferred Lease Rate", type: "text" },
        { key: "negotiable", label: "Negotiable", type: "radio", options: ["Yes", "No"] },
        { key: "specialInstructions", label: "Special Instructions", type: "textarea" },
        { key: "needParking", label: "Need Parking?", type: "radio", options: ["Yes", "No"] },
        { key: "parkingSlots", label: "Quantity of Slots", type: "text" },
        { key: "parkingSpecialInstructions", label: "Parking Special Instructions", type: "textarea" },
      ],
    },
    {
      title: "C. Employment Data",
      fields: [
        { key: "typeOfEmployment", label: "Type of Employment", type: "radio", options: ["Employed", "Business Owner", "Practicing Profession"] },
        { key: "position", label: "Position", type: "text" },
        { key: "companyName", label: "Name of Company", type: "text" },
        { key: "natureOfBusiness", label: "Nature of Business", type: "text" },
        { key: "companyAddress", label: "Company Address", type: "textarea" },
        { key: "companyPhone", label: "Company Phone", type: "tel" },
        { key: "companyMobile", label: "Company Mobile Number", type: "tel" },
        { key: "companyEmail", label: "Company Email Address", type: "email" },
      ],
    },
    {
      title: "D. Client Acknowledgement",
      fields: [
        {
          key: "howDidYouKnow",
          label: "How did you know about O-Lease?",
          type: "radio",
          options: ["Website", "Social Media", "Email", "Property Management Office"],
          allowOther: true,
        },
      ],
    },
  ],
};
