#include "runtime.h"
#include "std/base64.h"

int main(void) {
    TSC_INIT();
    const String encoded = tsc_btoa(STR_LIT("hello"));
    (void)encoded;
    printf("%s\n", encoded.data);
    tsc_string_release(encoded);
    return 0;
}
