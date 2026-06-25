#include "runtime.h"
#include "std/base64.h"

int main(void) {
    TSC_INIT();
    const String decoded = tsc_atob(STR_LIT("aGVsbG8="));
    (void)decoded;
    printf("%s\n", decoded.data);
    tsc_string_release(decoded);
    return 0;
}
