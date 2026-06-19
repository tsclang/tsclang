#include "runtime.h"

int main(void) {
    TSC_INIT();
    const TscError e = (TscError){ .message = STR_LIT("something failed") };
    return 0;
}
