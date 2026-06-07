#include "runtime.h"

typedef struct { int32_t x; } Data;
static const Serializable_vtable Data_Serializable_vtable = {  };

int main(void) {
    TSC_INIT();
    printf("ok\n");
    return 0;
}
