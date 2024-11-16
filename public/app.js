//import FHIR from 'fhirclient';

// Epic OAuth 2.0 Configuration for Sandbox
const epicConfig = {
    clientId: '9a56b469-7715-4279-9997-8b1ba37cf8dc',
    scope: 'openid fhirUser',
    redirectUri: 'http://localhost:3000',
    authorizationUrl: 'https://fhir.epic.com/interconnect-fhir-oauth/oauth2/authorize',
    tokenUrl: 'https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token',
    fhirBaseUrl: 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4'
};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    console.log('Application initialized');
    
    // Check if FHIR is defined
    if (typeof FHIR !== 'undefined') {
        console.log('FHIR client loaded successfully');

        const signInButton = document.getElementById('signInButton');
        if (signInButton) {
            signInButton.addEventListener('click', signIn); // Attach event listener
            console.log('Sign-in button handler attached');
        } else {
            console.error('Sign-in button not found');
        }
        
        handleAuthCallback(); // Call this to handle the redirect
    } else {
        console.error('FHIR client is not defined. Please ensure the FHIR client script is loaded correctly.');
    }
});

// Function to initiate Epic authorization
async function signIn() {
    console.log('Sign-in button clicked'); // Debug log
    
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'block'; // Show loading indicator
    } else {
        console.error('Loading indicator not found');
    }

    document.getElementById('debugInfo').textContent = 'Initiating Epic authorization...';

    try {
        await initiateEpicAuth(); // Ensure this function is called
    } catch (error) {
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none'; // Hide loading indicator on error
        }
        console.error('Sign-in failed:', error);
        document.getElementById('debugInfo').textContent = 
            `Sign-in failed: ${error.message}`;
    }
}

// Function to initiate Epic authorization
async function initiateEpicAuth() {
    try {
        console.log('Initiating Epic authorization...');
        
        const state = generateRandomState();
        sessionStorage.setItem('epic_auth_state', state);

        const pkce = await generatePKCE();
        sessionStorage.setItem('pkce_verifier', pkce.verifier);

        const authUrl = new URL(epicConfig.authorizationUrl);
        const params = {
            response_type: 'code',
            client_id: epicConfig.clientId,
            redirect_uri: epicConfig.redirectUri,
            scope: epicConfig.scope,
            state: state,
            code_challenge: pkce.challenge,
            code_challenge_method: 'S256',
            aud: epicConfig.fhirBaseUrl
        };

        Object.entries(params).forEach(([key, value]) => {
            authUrl.searchParams.append(key, value);
        });

        console.log('Redirecting to Epic authorization page...');
        window.location.href = authUrl.toString();

    } catch (error) {
        console.error('Failed to initiate Epic authorization:', error);
        document.getElementById('debugInfo').textContent = 
            `Authorization initialization failed: ${error.message}`;
    }
}

// Helper function to generate random state
function generateRandomState() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Helper function to generate PKCE values
async function generatePKCE() {
    const verifier = generateRandomState();
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

    return { verifier, challenge };
}

// Function to handle the authorization callback
async function handleAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    console.log('Authorization code:', code); // Log the authorization code

    if (code) {
        try {
            const tokenData = await fetchAccessToken(code);
            const accessToken = tokenData.access_token; // Adjust based on your token structure
            console.log('Access Token:', accessToken); // Debug log to check the access token
            await fetchPatientData(accessToken);
        } catch (error) {
            console.error('Error during authorization callback:', error);
            document.getElementById('debugInfo').textContent = `Authorization failed: ${error.message}`;
        }
    } else {
        console.error('No authorization code found in the URL.');
    }
}

// Function to exchange the authorization code for an access token
async function fetchAccessToken(code) {
    const response = await fetch(epicConfig.tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: epicConfig.redirectUri,
            client_id: epicConfig.clientId,
            code_verifier: sessionStorage.getItem('pkce_verifier')
        })
    });

    if (!response.ok) {
        throw new Error('Failed to exchange authorization code for access token');
    }

    return await response.json(); // This should contain the access token and patient information
}

// Function to fetch patient data
async function fetchPatientData(accessToken) {
    // Debugging: Check if FHIR is defined
    console.log('FHIR:', FHIR); // Check if FHIR is defined

    const client = FHIR.client({
        serverUrl: epicConfig.fhirBaseUrl,
        auth: {
            bearer: accessToken // Use the access token you received
        }
    });

    try {
        // Fetch the patient details
        const patient = await client.request('Patient'); // Adjust based on your FHIR server setup
        displayPatientDetails(patient);

        // Fetch medications
        const medications = await client.request(`MedicationRequest?patient=${patient.id}`);
        displayMedications(medications);

        // Fetch lab reports
        const labReports = await client.request(`Observation?patient=${patient.id}&category=lab`);
        displayLabReports(labReports);

        // Fetch vital signs
        const vitalSigns = await client.request(`Observation?patient=${patient.id}&category=vital-signs`);
        displayVitalSigns(vitalSigns);

    } catch (error) {
        console.error('Error fetching patient data:', error);
        document.getElementById('debugInfo').textContent = `Error fetching patient data: ${error.message}`;
    }
}

// Function to display patient details
function displayPatientDetails(patient) {
    const patientDetails = `
        <p>Name: ${patient.name[0].given.join(' ')} ${patient.name[0].family}</p>
        <p>Gender: ${patient.gender}</p>
        <p>Date of Birth: ${patient.birthDate}</p>
        <p>Identifier: ${patient.identifier[0].value}</p>
    `;
    document.getElementById('patientDetails').innerHTML = patientDetails;
    document.getElementById('patientInfo').style.display = 'block'; // Show patient info section
}

// Function to display medications
function displayMedications(medications) {
    const medicationsList = medications.entry.map(entry => `<li>${entry.resource.medicationCodeableConcept.text}</li>`).join('');
    document.getElementById('medicationsList').innerHTML = medicationsList || '<li>No medications found.</li>';
}

// Function to display lab reports
function displayLabReports(labReports) {
    const labReportsList = labReports.entry.map(entry => `<li>${entry.resource.code.text}: ${entry.resource.valueQuantity.value} ${entry.resource.valueQuantity.unit}</li>`).join('');
    document.getElementById('labReportsList').innerHTML = labReportsList || '<li>No lab reports found.</li>';
}

// Function to display vital signs
function displayVitalSigns(vitalSigns) {
    const vitalSignsList = vitalSigns.entry.map(entry => `<li>${entry.resource.code.text}: ${entry.resource.valueQuantity.value} ${entry.resource.valueQuantity.unit}</li>`).join('');
    document.getElementById('vitalSignsList').innerHTML = vitalSignsList || '<li>No vital signs found.</li>';
}
