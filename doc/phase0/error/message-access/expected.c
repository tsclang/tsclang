#include "runtime.h"

int main(void) {
    TSC_INIT();
    const TscError e = (TscError){ .message = STR_LIT("fail") };
    printf("%.*s\n", (int)e.message.length, e.message.data);
    return 0;
}
