#include "runtime.h"

int main(void) {
    TSC_INIT();
    const TscError e = (TscError){ .message = STR_LIT("fail") };
    printf("%s\n", e.message.data);
    return 0;
}
