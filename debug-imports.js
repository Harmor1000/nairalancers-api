// Debug script to test library imports
console.log('🔍 Debug: Testing library imports...\n');

async function testImports() {
    // Test LibreOffice import
    try {
        console.log('Testing libreoffice-convert import...');
        const libreofficeModule = await import('libreoffice-convert');
        console.log('✅ LibreOffice module imported');
        console.log('   - Default export:', typeof libreofficeModule.default);
        console.log('   - Convert property:', typeof libreofficeModule.convert);
        console.log('   - Direct module:', typeof libreofficeModule);
        console.log('   - All keys:', Object.keys(libreofficeModule));
        
        const libreofficeConvert = libreofficeModule.default || libreofficeModule.convert || libreofficeModule;
        console.log('   - Final function:', typeof libreofficeConvert);
        
    } catch (error) {
        console.log('❌ LibreOffice import failed:', error.message);
    }
    
    console.log('');
    
    // Test PSD import
    try {
        console.log('Testing psd import...');
        const psdModule = await import('psd');
        console.log('✅ PSD module imported');
        console.log('   - Default export:', typeof psdModule.default);
        console.log('   - Direct module:', typeof psdModule);
        console.log('   - All keys:', Object.keys(psdModule));
        
        const psd = psdModule.default || psdModule;
        console.log('   - Final object:', typeof psd);
        
        if (psd) {
            console.log('   - PSD methods:', Object.keys(psd));
            console.log('   - fromBuffer method:', typeof psd.fromBuffer);
            console.log('   - PSD constructor:', typeof psd.PSD);
        }
        
    } catch (error) {
        console.log('❌ PSD import failed:', error.message);
    }
    
    console.log('');
    
    // Test other critical imports
    const libraries = [
        'sharp',
        'unzipper', 
        'node-unrar-js'
    ];
    
    for (const lib of libraries) {
        try {
            const module = await import(lib);
            console.log(`✅ ${lib}: imported successfully`);
        } catch (error) {
            console.log(`❌ ${lib}: ${error.message}`);
        }
    }
}

testImports().catch(console.error);
