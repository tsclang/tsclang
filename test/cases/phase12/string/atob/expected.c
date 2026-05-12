#include "runtime.h"
#include "std/base64.h"

int main(void) {
    TSC_INIT();
    String decoded = tsc_atob(STR_LIT("aGVsbG8="));
    printf("%s\n", decoded.data);
    return 0;
}
