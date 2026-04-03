#include "runtime.h"

typedef struct { void (*draw)(void *self); } Drawable_vtable;
typedef struct { void *self; const Drawable_vtable *vtable; } Drawable;
typedef struct { int _dummy; } Circle;

static void Circle_draw(void *_self) {
    (void)_self;
    printf("%s\n", "circle");
}

static const Drawable_vtable Circle_Drawable_vtable = { .draw = Circle_draw };

int main(void) {
    TSC_INIT();
    Circle c = {0};
    Drawable shape = {.self = &c, .vtable = &Circle_Drawable_vtable};
    shape.vtable->draw(shape.self);
    return 0;
}
